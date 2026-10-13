import { FilterQuery, Types } from 'mongoose';
import {
  Customer,
  CustomerAdvance,
  ExpenseTransaction,
  FinancialAccount,
  Installment,
  nextSequence,
  SchemeEnrollment,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { AuthUser } from '../types/express';
import { withTransaction } from '../db/mongo';
import { writeAudit } from './audit.service';
import { recordMovement } from './cashMovement.service';
import { PaymentMethod } from '../constants';

export interface CreateAdvanceInput {
  customerId: string;
  enrollmentId?: string;
  type: 'BIKE' | 'CASH';
  advanceDate: Date;
  amountPkr: number;
  bikeDescription?: string;
  bikeModel?: string;
  chassisNumber?: string;
  engineNumber?: string;
  method?: PaymentMethod;
  accountId?: string;
  purpose?: string;
  authorizedBy?: string;
  approver?: string;
  supportingReference?: string;
  notes?: string;
  status?: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
}

/**
 * Creates an Advance Bike or Advance Cash case (PRD section 7).
 *
 * Invariants enforced here:
 *  - `stopsInstallments` is always false: an advance never stops the installment schedule;
 *  - an Advance Cash case creates exactly ONE expense record and ONE cash movement,
 *    linked back to the advance so the money can never be double counted;
 *  - an Advance Bike records the agreed valuation only - it is not a purchase, not stock,
 *    and it creates no cash movement.
 */
export async function createAdvance(input: CreateAdvanceInput, user: AuthUser) {
  if (!Types.ObjectId.isValid(input.customerId)) throw ApiError.notFound('Customer');
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa < 0) {
    throw ApiError.badRequest('Advance amount/valuation must be zero or more', 'INVALID_AMOUNT');
  }
  if (input.type === 'CASH' && amountPaisa <= 0) {
    throw ApiError.badRequest('Advance cash requires a positive amount', 'INVALID_AMOUNT');
  }
  if (input.type === 'BIKE' && !input.bikeDescription?.trim() && !input.bikeModel?.trim()) {
    throw ApiError.badRequest('Advance bike requires a bike description or model', 'BIKE_DETAILS_REQUIRED');
  }

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};

    const customer = await Customer.findById(input.customerId).session(session ?? null).lean();
    if (!customer) throw ApiError.notFound('Customer');

    const enrollment = input.enrollmentId
      ? await SchemeEnrollment.findById(input.enrollmentId).session(session ?? null).lean()
      : await SchemeEnrollment.findOne({ customer: customer._id })
          .sort({ createdAt: -1 })
          .session(session ?? null)
          .lean();
    if (!enrollment) throw ApiError.notFound('Scheme enrollment');

    const seq = await nextSequence('advance');
    const advance = new CustomerAdvance({
      advanceCode: `ADV-${String(seq).padStart(5, '0')}`,
      customer: customer._id,
      enrollment: enrollment._id,
      tokenNumber: enrollment.tokenNumber,
      location: customer.location,
      type: input.type,
      advanceDate: new Date(input.advanceDate),
      amountPaisa,
      bikeDescription: input.bikeDescription,
      bikeModel: input.bikeModel,
      chassisNumber: input.chassisNumber,
      engineNumber: input.engineNumber,
      method: input.method,
      purpose: input.purpose,
      status: input.status ?? 'ACTIVE',
      stopsInstallments: false, // never true - see PRD p.9
      authorizedBy: input.authorizedBy,
      approver: input.approver,
      supportingReference: input.supportingReference,
      notes: input.notes,
      createdBy: user.id,
      createdByName: user.name,
    });

    // ---- Advance Cash: one expense record + one cash outflow ------------------------
    if (input.type === 'CASH') {
      let account;
      if (input.accountId) {
        account = await FinancialAccount.findById(input.accountId).session(session ?? null).lean();
        if (!account) throw ApiError.notFound('Financial account');
      } else {
        account =
          (await FinancialAccount.findOne({ type: 'CASH', isDefault: true, isActive: true }).session(session ?? null).lean()) ??
          (await FinancialAccount.findOne({ type: 'CASH', isActive: true }).session(session ?? null).lean());
      }
      if (!account) {
        throw ApiError.badRequest('No active cash account is configured for the advance payout', 'NO_CASH_ACCOUNT');
      }

      const expenseSeq = await nextSequence('expense');
      const expense = new ExpenseTransaction({
        transactionId: `EXP-${String(expenseSeq).padStart(7, '0')}`,
        category: 'CUSTOMER_ADVANCE_CASH',
        amountPaisa,
        // Customer advances are a cash outflow but NOT an operating expense (PRD p.12).
        isOperatingExpense: false,
        method: input.method ?? 'CASH',
        account: account._id,
        accountName: account.name,
        transactionDate: advance.advanceDate,
        paidTo: customer.name,
        customer: customer._id,
        tokenNumber: enrollment.tokenNumber,
        location: customer.location,
        purpose: input.purpose ?? 'Advance cash issued to customer',
        sourceType: 'ADVANCE_CASH',
        sourceRef: advance._id,
        enteredBy: user.id,
        enteredByName: user.name,
      });
      if (session) await expense.save({ session });
      else await expense.save();
      advance.expenseTransaction = expense._id;

      const movement = await recordMovement(
        {
          account: account._id,
          direction: 'OUT',
          amountPaisa,
          movementDate: advance.advanceDate,
          sourceType: 'ADVANCE_CASH',
          sourceRef: advance._id,
          description: `Advance cash to ${customer.name} (token ${String(enrollment.tokenNumber).padStart(3, '0')})`,
          reference: advance.advanceCode,
          customer: customer._id,
          enteredBy: user.id,
          enteredByName: user.name,
        },
        session
      );
      advance.cashMovement = movement._id;

      expense.cashMovement = movement._id;
      if (session) await expense.save({ session });
      else await expense.save();
    }

    if (session) await advance.save({ session });
    else await advance.save();

    await Customer.updateOne(
      { _id: customer._id },
      input.type === 'BIKE' ? { $set: { advanceBikeActive: true } } : { $set: { advanceCashActive: true } },
      opts
    );

    // Proof for the acceptance test: the schedule is untouched by an advance.
    const payableCount = await Installment.countDocuments({
      enrollment: enrollment._id,
      stoppedAfterDraw: { $ne: true },
      status: { $in: ['unpaid', 'partial', 'overdue'] },
    }).session(session ?? null);

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'CustomerAdvance',
        entityId: String(advance._id),
        description: `Created advance ${input.type} of ${amountPaisa / 100} PKR for token ${String(enrollment.tokenNumber).padStart(3, '0')} - installments continue`,
        newValue: {
          type: input.type,
          amountPaisa,
          stopsInstallments: false,
          payableInstallmentsRemaining: payableCount,
        },
        reason: input.purpose ?? 'Advance arrangement recorded',
      },
      session
    );

    return { advance: serializeMoney(advance), payableInstallmentsRemaining: payableCount };
  });
}

export interface UpdateAdvanceInput {
  status?: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
  approver?: string;
  supportingReference?: string;
  settlementNotes?: string;
  notes?: string;
  purpose?: string;
  reason?: string;
}

/** Updates non-financial fields of an advance. Amount changes require a reversal record. */
export async function updateAdvance(id: string, patch: UpdateAdvanceInput, user: AuthUser) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Advance');
  const before = await CustomerAdvance.findById(id).lean();
  if (!before) throw ApiError.notFound('Advance');

  const updated = await CustomerAdvance.findByIdAndUpdate(
    id,
    { $set: { ...patch, reason: undefined } },
    { new: true }
  ).lean();

  if (patch.status === 'CANCELLED' || patch.status === 'SETTLED') {
    const flag = before.type === 'BIKE' ? 'advanceBikeActive' : 'advanceCashActive';
    const stillActive = await CustomerAdvance.countDocuments({
      customer: before.customer,
      type: before.type,
      status: 'ACTIVE',
      _id: { $ne: before._id },
    });
    if (stillActive === 0) await Customer.updateOne({ _id: before.customer }, { $set: { [flag]: false } });
  }

  await writeAudit({
    actor: user,
    action: 'UPDATE',
    entityType: 'CustomerAdvance',
    entityId: id,
    description: `Updated advance ${before.advanceCode} (${patch.status ?? 'details'})`,
    previousValue: { status: before.status },
    newValue: patch,
    reason: patch.reason ?? 'Advance update',
  });

  return serializeMoney(updated);
}

export interface AdvanceQuery {
  type?: 'BIKE' | 'CASH';
  status?: string;
  location?: 'MACH' | 'QUETTA';
  customerId?: string;
  tokenNumber?: number;
  dateFrom?: Date;
  dateTo?: Date;
  onlyStillPaying?: boolean;
  onlyDrawnLater?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listAdvances(query: AdvanceQuery) {
  const filter: FilterQuery<unknown> = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.location) filter.location = query.location;
  if (query.customerId) filter.customer = new Types.ObjectId(query.customerId);
  if (query.tokenNumber) filter.tokenNumber = query.tokenNumber;
  if (query.dateFrom || query.dateTo) {
    filter.advanceDate = {};
    if (query.dateFrom) filter.advanceDate.$gte = query.dateFrom;
    if (query.dateTo) filter.advanceDate.$lte = query.dateTo;
  }

  // The scheme can never produce more advance cases than it has tokens, but the query is
  // capped anyway so a filter mistake can never pull the whole collection.
  const items = await CustomerAdvance.find(filter)
    .sort({ advanceDate: -1 })
    .limit(500)
    .populate('customer', 'name cnic phone location status drawStatus')
    .lean();

  let rows = items.map((a) => {
    const c = a.customer as unknown as Record<string, unknown> | undefined;
    return {
      ...serializeMoney<Record<string, unknown>>(a),
      tokenCode: String(a.tokenNumber).padStart(3, '0'),
      customerName: String(c?.name ?? ''),
      customerStatus: String(c?.status ?? ''),
      drawStatus: String(c?.drawStatus ?? 'NONE'),
      installmentsContinue: !a.stopsInstallments,
    };
  });

  if (query.onlyStillPaying) rows = rows.filter((r) => r.customerStatus === 'active');
  if (query.onlyDrawnLater) rows = rows.filter((r) => r.drawStatus === 'CONFIRMED');

  if (query.search) {
    const term = query.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        String(r.customerName).toLowerCase().includes(term) ||
        r.tokenCode.includes(term) ||
        String((r as Record<string, unknown>).advanceCode).toLowerCase().includes(term)
    );
  }

  // Totals describe the whole filtered set, not just the page being shown - otherwise the
  // summary cards on the Advances page would quietly become page-scoped once it paginates.
  const totalPaisa = rows.reduce((sum, r) => sum + Number((r as Record<string, unknown>).amountPaisa ?? 0), 0);
  const bikeCount = rows.filter((r) => (r as Record<string, unknown>).type === 'BIKE').length;
  const cashCount = rows.filter((r) => (r as Record<string, unknown>).type === 'CASH').length;
  const stillPayingCount = rows.filter((r) => r.customerStatus === 'active').length;

  const limit = Math.min(Math.max(Number(query.limit ?? 25) || 25, 1), 100);
  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  const start = (page - 1) * limit;

  return {
    items: rows.slice(start, start + limit),
    // Pagination is reported whenever a page was requested, so callers can tell the difference
    // between "this is the whole list" and "this is page 1 of 4".
    pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
    totals: { count: rows.length, totalPaisa, bikeCount, cashCount, stillPayingCount },
  };
}

export async function getAdvanceById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Advance');
  const advance = await CustomerAdvance.findById(id)
    .populate('customer', 'name cnic phone location status drawStatus')
    .populate('expenseTransaction')
    .populate('cashMovement')
    .lean();
  if (!advance) throw ApiError.notFound('Advance');
  return serializeMoney(advance);
}
