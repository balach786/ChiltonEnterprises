import { ClientSession, FilterQuery, Types } from 'mongoose';
import { PAYMENT_METHODS, PaymentMethod } from '../constants';
import {
  CashMovement,
  Customer,
  FinancialAccount,
  IncomeTransaction,
  Installment,
  Payment,
  Receipt,
  SchemeEnrollment,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { AuthUser } from '../types/express';
import { withTransaction } from '../db/mongo';
import { writeAudit } from './audit.service';
import { getSettings, nextReceiptNumber } from './settings.service';
import { recordMovement } from './cashMovement.service';
import { recomputeEnrollment } from './installment.service';
import { allocatePayment, AllocationTarget } from '../utils/schedule';
import { nextSequence } from '../models/Counter';

export interface RecordPaymentInput {
  customerId: string;
  enrollmentId?: string;
  monthNumbers?: number[];
  installmentIds?: string[];
  /** Allocate to the oldest outstanding installments when no months are given. */
  autoAllocate?: boolean;
  amountPkr: number;
  paymentDate?: Date;
  method?: PaymentMethod;
  accountId?: string;
  notes?: string;
  sourceType?: 'INSTALLMENT' | 'OTHER';
  /** Allow the unallocatable remainder to sit as an unallocated customer credit. */
  allowCredit?: boolean;
  idempotencyKey?: string;
}

async function resolveAccount(accountId: string | undefined, method: PaymentMethod, session: ClientSession | null) {
  if (accountId) {
    if (!Types.ObjectId.isValid(accountId)) throw ApiError.badRequest('Invalid account id', 'INVALID_ACCOUNT');
    const acc = await FinancialAccount.findById(accountId).session(session ?? null).lean();
    if (!acc) throw ApiError.notFound('Financial account');
    return acc;
  }
  const type = method === 'BANK' || method === 'ONLINE' || method === 'CHEQUE' ? 'BANK' : 'CASH';
  const acc =
    (await FinancialAccount.findOne({ type, isDefault: true, isActive: true }).session(session ?? null).lean()) ??
    (await FinancialAccount.findOne({ type, isActive: true }).session(session ?? null).lean());
  if (!acc) {
    throw ApiError.badRequest(
      `No active ${type} account is configured. Create one under Cash & Bank first.`,
      'NO_DEFAULT_ACCOUNT'
    );
  }
  return acc;
}

/**
 * Records a customer payment.
 *
 * One call produces exactly one payment, one receipt, one cash movement and one linked
 * income mirror - never a second independent income record (PRD p.10).
 */
export async function recordPayment(input: RecordPaymentInput, user: AuthUser) {
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
    throw ApiError.badRequest('Payment amount must be greater than zero', 'INVALID_AMOUNT');
  }
  if (!Types.ObjectId.isValid(input.customerId)) throw ApiError.notFound('Customer');

  const settings = await getSettings();
  const method: PaymentMethod = input.method ?? 'CASH';
  if (!PAYMENT_METHODS.includes(method)) throw ApiError.badRequest('Invalid payment method');

  // Wrapped so a unique-index collision on idempotencyKey can be turned into an idempotent replay.
  async function runPaymentTransaction() {
    return withTransaction(async (session) => {
    const opts = session ? { session } : {};

    if (input.idempotencyKey) {
      const dup = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).session(session ?? null).lean();
      if (dup) return { payment: dup, receipt: null, credit: false, allocations: dup.allocations ?? [] };
    }

    const customer = await Customer.findById(input.customerId).session(session ?? null).lean();
    if (!customer) throw ApiError.notFound('Customer');

    const enrollment = input.enrollmentId
      ? await SchemeEnrollment.findById(input.enrollmentId).session(session ?? null).lean()
      : await SchemeEnrollment.findOne({ customer: customer._id, status: 'active' })
          .session(session ?? null)
          .sort({ createdAt: -1 })
          .lean();
    if (!enrollment) throw ApiError.notFound('Active scheme enrollment');
    if (enrollment.status === 'cancelled') {
      throw ApiError.badRequest('This enrollment has been cancelled', 'ENROLLMENT_CANCELLED');
    }

    // ---- resolve the target installments -------------------------------------------
    const installmentFilter: FilterQuery<unknown> = { enrollment: enrollment._id };
    if (input.installmentIds?.length) {
      installmentFilter._id = { $in: input.installmentIds.map((i) => new Types.ObjectId(i)) };
    } else if (input.monthNumbers?.length) {
      if (!settings.allowMultipleMonthPayments && input.monthNumbers.length > 1) {
        throw ApiError.badRequest('Multi-month payments are disabled in system settings', 'MULTI_MONTH_DISABLED');
      }
      installmentFilter.monthNumber = { $in: input.monthNumbers.map((m) => Math.round(m)) };
    } else if (input.autoAllocate) {
      installmentFilter.stoppedAfterDraw = { $ne: true };
      installmentFilter.status = { $in: ['unpaid', 'partial', 'overdue'] };
    } else {
      throw ApiError.badRequest(
        'Select at least one installment month, or enable auto allocation',
        'NO_INSTALLMENT_SELECTED'
      );
    }

    const installments = await Installment.find(installmentFilter)
      .sort({ monthNumber: 1 })
      .session(session ?? null)
      .lean();
    if (installments.length === 0) throw ApiError.notFound('Installment');

    const targets: AllocationTarget[] = installments.map((i) => ({
      installmentId: String(i._id),
      monthNumber: i.monthNumber,
      scheduledPaisa: i.scheduledPaisa,
      paidPaisa: i.paidPaisa,
      adjustedPaisa: i.adjustedPaisa,
      status: i.status,
    }));

    const allocation = allocatePayment(targets, amountPaisa, {
      allowPartial: settings.allowPartialPayments,
      allowOverpay: true,
    });

    const isCreditOnly = allocation.allocatedPaisa === 0 && allocation.unallocatedPaisa > 0;

    // An amount that cannot be allocated to the selected periods is never silently moved
    // elsewhere: it must be recorded as an unallocated customer credit, explicitly.
    if (allocation.unallocatedPaisa > 0 && !input.allowCredit) {
      throw ApiError.badRequest(
        allocation.allocatedPaisa === 0
          ? allocation.rejected.length
            ? `Nothing could be allocated: ${allocation.rejected.map((r) => r.reason).join('; ')}`
            : 'No outstanding balance to allocate. Set allowCredit to hold this as a customer credit.'
          : `The payment exceeds the selected installment balance by ${(allocation.unallocatedPaisa / 100).toFixed(2)} PKR. Set allowCredit to hold the remainder as a customer credit, or select additional months.`,
        'NOTHING_ALLOCATED',
        {
          rejected: allocation.rejected,
          allocatedPaisa: allocation.allocatedPaisa,
          unallocatedPaisa: allocation.unallocatedPaisa,
        }
      );
    }
    if (allocation.allocatedPaisa === 0 && !isCreditOnly) {
      throw ApiError.badRequest('Payment could not be allocated', 'NOTHING_ALLOCATED');
    }

    const account = await resolveAccount(input.accountId, method, session);

    // ---- payment + receipt ---------------------------------------------------------
    const seq = await nextSequence('payment');
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
    const receiptNumber = await nextReceiptNumber(session);

    const payment = new Payment({
      paymentNumber,
      customer: customer._id,
      enrollment: enrollment._id,
      tokenNumber: enrollment.tokenNumber,
      location: customer.location,
      amountPaisa,
      allocatedPaisa: allocation.allocatedPaisa,
      unallocatedPaisa: allocation.unallocatedPaisa,
      allocations: allocation.allocations.map((a) => ({
        installment: new Types.ObjectId(a.installmentId),
        monthNumber: a.monthNumber,
        amountPaisa: a.amountPaisa,
      })),
      method,
      account: account._id,
      accountName: account.name,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      sourceType: input.sourceType ?? 'INSTALLMENT',
      notes: input.notes,
      enteredBy: user.id,
      enteredByName: user.name,
      status: 'posted',
      idempotencyKey: input.idempotencyKey,
    });
    if (session) await payment.save({ session });
    else await payment.save();

    // ---- ledger updates ------------------------------------------------------------
    for (const a of allocation.allocations) {
      await Installment.updateOne(
        { _id: new Types.ObjectId(a.installmentId) },
        { $inc: { paidPaisa: a.amountPaisa }, $set: { lastPaymentAt: payment.paymentDate } },
        opts
      );
    }
    await recomputeEnrollment(enrollment._id, session, new Date());
    await Customer.updateOne(
      { _id: customer._id },
      { $inc: { lifetimePaidPaisa: amountPaisa } },
      opts
    );

    // ---- receipt -------------------------------------------------------------------
    const receipt = new Receipt({
      number: receiptNumber,
      payment: payment._id,
      customer: customer._id,
      tokenNumber: enrollment.tokenNumber,
      customerName: customer.name,
      amountPaisa,
      method,
      issuedAt: payment.paymentDate,
      issuedBy: user.id,
      issuedByName: user.name,
      detail: allocation.allocations
        .map((a) => `Month ${a.monthNumber}: ${(a.amountPaisa / 100).toFixed(2)} PKR`)
        .join(' | ') || 'Unallocated customer credit',
      allocations: allocation.allocations.map((a) => ({
        monthNumber: a.monthNumber,
        amountPaisa: a.amountPaisa,
      })),
    });
    if (session) await receipt.save({ session });
    else await receipt.save();

    payment.receipt = receipt._id;

    // ---- cash movement (exactly one) ----------------------------------------------
    const movement = await recordMovement(
      {
        account: account._id,
        direction: 'IN',
        amountPaisa,
        movementDate: payment.paymentDate,
        sourceType: 'CUSTOMER_PAYMENT',
        sourceRef: payment._id,
        description: `Customer payment ${receiptNumber} - token ${String(enrollment.tokenNumber).padStart(3, '0')}`,
        reference: receiptNumber,
        customer: customer._id,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );
    payment.cashMovement = movement._id;

    // ---- income mirror (linked, never a second independent entry) ------------------
    const incomeSeq = await nextSequence('income');
    const income = new IncomeTransaction({
      transactionId: `INC-${String(incomeSeq).padStart(7, '0')}`,
      category: 'CUSTOMER_INSTALLMENT',
      amountPaisa,
      method,
      account: account._id,
      accountName: account.name,
      transactionDate: payment.paymentDate,
      customer: customer._id,
      tokenNumber: enrollment.tokenNumber,
      location: customer.location,
      isRevenue: true,
      sourceType: 'CUSTOMER_PAYMENT',
      sourceRef: payment._id,
      receiptNumber,
      notes: input.notes,
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await income.save({ session });
    else await income.save();

    payment.incomeTransaction = income._id;
    income.cashMovement = movement._id;
    if (session) {
      await income.save({ session });
      await payment.save({ session });
    } else {
      await income.save();
      await payment.save();
    }

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: String(payment._id),
        description: `Recorded payment ${receiptNumber} of ${amountPaisa / 100} PKR for token ${String(enrollment.tokenNumber).padStart(3, '0')}`,
        newValue: {
          amountPaisa,
          allocatedPaisa: allocation.allocatedPaisa,
          unallocatedPaisa: allocation.unallocatedPaisa,
          months: allocation.allocations.map((a) => a.monthNumber),
          receiptNumber,
          account: account.name,
        },
        reason: 'Customer payment received',
      },
      session
    );

    return {
      payment: payment.toObject(),
      receipt: receipt.toObject(),
      credit: isCreditOnly,
      allocations: allocation.allocations,
      rejected: allocation.rejected,
      unallocatedPaisa: allocation.unallocatedPaisa,
    };
    });
  }

  try {
    return await runPaymentTransaction();
  } catch (error) {
    // Lost-response retry: the first write committed but the client never saw the response.
    // The unique index rejects the second insert - hand back the payment that was recorded.
    if (input.idempotencyKey && (error as { code?: number }).code === 11000) {
      const existing = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (existing) {
        return {
          payment: existing,
          receipt: null,
          credit: false,
          allocations: existing.allocations ?? [],
          rejected: [],
          unallocatedPaisa: 0,
        };
      }
    }
    throw error;
  }
}

/**
 * Reverses a payment (PRD p.8: reversed or adjusted, never deleted).
 * The original document is retained with status `reversed` and points at the reversing
 * record; the ledger, cash balance and customer totals are all recalculated.
 */
export async function reversePayment(paymentId: string, reason: string, user: AuthUser) {
  if (!reason?.trim()) throw ApiError.badRequest('A reason is required to reverse a payment', 'REASON_REQUIRED');
  if (!Types.ObjectId.isValid(paymentId)) throw ApiError.notFound('Payment');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const original = await Payment.findById(paymentId).session(session ?? null).lean();
    if (!original) throw ApiError.notFound('Payment');
    if (original.status === 'reversed') {
      throw ApiError.conflict('This payment has already been reversed', 'ALREADY_REVERSED');
    }

    const seq = await nextSequence('payment');
    const reversal = new Payment({
      paymentNumber: `PAY-REV-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`,
      customer: original.customer,
      enrollment: original.enrollment,
      tokenNumber: original.tokenNumber,
      location: original.location,
      amountPaisa: -original.amountPaisa,
      allocatedPaisa: -original.allocatedPaisa,
      unallocatedPaisa: -original.unallocatedPaisa,
      allocations: (original.allocations ?? []).map((a) => ({
        installment: a.installment,
        monthNumber: a.monthNumber,
        amountPaisa: -a.amountPaisa,
      })),
      method: original.method,
      account: original.account,
      accountName: original.accountName,
      paymentDate: new Date(),
      sourceType: 'REVERSAL',
      notes: `Reversal of ${original.paymentNumber}: ${reason}`,
      enteredBy: user.id,
      enteredByName: user.name,
      status: 'posted',
      reversesPayment: original._id,
    });
    if (session) await reversal.save({ session });
    else await reversal.save();

    await Payment.updateOne(
      { _id: original._id },
      {
        $set: {
          status: 'reversed',
          reversedAt: new Date(),
          reversedBy: user.id,
          reversalReason: reason,
          reversedByPayment: reversal._id,
        },
      },
      opts
    );

    for (const a of original.allocations ?? []) {
      await Installment.updateOne(
        { _id: a.installment },
        { $inc: { paidPaisa: -a.amountPaisa } },
        opts
      );
    }
    await recomputeEnrollment(original.enrollment, session, new Date());
    await Customer.updateOne(
      { _id: original.customer },
      { $inc: { lifetimePaidPaisa: -original.amountPaisa } },
      opts
    );

    if (original.receipt) {
      await Receipt.updateOne({ _id: original.receipt }, { $set: { status: 'cancelled' } }, opts);
    }

    let movementId: Types.ObjectId | undefined;
    if (original.account) {
      const movement = await recordMovement(
        {
          account: original.account,
          direction: 'OUT',
          amountPaisa: original.amountPaisa,
          movementDate: new Date(),
          sourceType: 'CUSTOMER_PAYMENT',
          sourceRef: reversal._id,
          description: `Reversal of ${original.paymentNumber}`,
          reference: original.paymentNumber,
          customer: original.customer,
          enteredBy: user.id,
          enteredByName: user.name,
        },
        session
      );
      movementId = movement._id;
    }

    if (original.incomeTransaction) {
      const incomeSeq = await nextSequence('income');
      const incomeRev = new IncomeTransaction({
        transactionId: `INC-REV-${String(incomeSeq).padStart(7, '0')}`,
        category: 'CUSTOMER_INSTALLMENT',
        amountPaisa: -original.amountPaisa,
        method: original.method,
        account: original.account,
        accountName: original.accountName,
        transactionDate: new Date(),
        customer: original.customer,
        tokenNumber: original.tokenNumber,
        location: original.location,
        isRevenue: true,
        sourceType: 'CUSTOMER_PAYMENT',
        sourceRef: reversal._id,
        receiptNumber: original.paymentNumber,
        notes: `Reversal: ${reason}`,
        enteredBy: user.id,
        enteredByName: user.name,
        status: 'posted',
        cashMovement: movementId,
      });
      if (session) await incomeRev.save({ session });
      else await incomeRev.save();
    }

    await writeAudit(
      {
        actor: user,
        action: 'REVERSAL',
        entityType: 'Payment',
        entityId: String(original._id),
        description: `Reversed payment ${original.paymentNumber}`,
        previousValue: { status: 'posted', amountPaisa: original.amountPaisa },
        newValue: { status: 'reversed', reversalPayment: String(reversal._id) },
        reason,
      },
      session
    );

    return serializeMoney({ original, reversal });
  });
}

/** Unallocated credit currently held for a customer (paisa). */
export async function getCustomerCreditPaisa(customerId: string): Promise<number> {
  const [held] = await Payment.aggregate([
    { $match: { customer: new Types.ObjectId(customerId), status: 'posted', unallocatedPaisa: { $ne: 0 } } },
    { $group: { _id: null, total: { $sum: '$unallocatedPaisa' } } },
  ]);
  const [used] = await Payment.aggregate([
    {
      $match: {
        customer: new Types.ObjectId(customerId),
        status: 'posted',
        sourceType: 'CREDIT_ALLOCATION',
      },
    },
    { $group: { _id: null, total: { $sum: '$allocatedPaisa' } } },
  ]);
  return (held?.total ?? 0) - (used?.total ?? 0);
}

/**
 * Explicitly allocates a previously held unallocated credit to chosen months. No new cash
 * movement is created - the money already entered the ledger when it was received.
 */
export async function allocateCredit(
  input: { customerId: string; monthNumbers: number[]; amountPkr: number; reason?: string },
  user: AuthUser
) {
  if (!Types.ObjectId.isValid(input.customerId)) throw ApiError.notFound('Customer');
  const amountPaisa = Math.round(input.amountPkr * 100);
  if (amountPaisa <= 0) throw ApiError.badRequest('Amount must be greater than zero');

  const available = await getCustomerCreditPaisa(input.customerId);
  if (amountPaisa > available) {
    throw ApiError.badRequest(
      `Only ${available / 100} PKR of unallocated credit is available`,
      'INSUFFICIENT_CREDIT'
    );
  }

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const enrollment = await SchemeEnrollment.findOne({ customer: input.customerId, status: 'active' })
      .session(session ?? null)
      .sort({ createdAt: -1 })
      .lean();
    if (!enrollment) throw ApiError.notFound('Active scheme enrollment');

    const installments = await Installment.find({
      enrollment: enrollment._id,
      monthNumber: { $in: input.monthNumbers },
    })
      .sort({ monthNumber: 1 })
      .session(session ?? null)
      .lean();

    const allocation = allocatePayment(
      installments.map((i) => ({
        installmentId: String(i._id),
        monthNumber: i.monthNumber,
        scheduledPaisa: i.scheduledPaisa,
        paidPaisa: i.paidPaisa,
        adjustedPaisa: i.adjustedPaisa,
        status: i.status,
      })),
      amountPaisa,
      { allowPartial: true, allowOverpay: false }
    );
    if (allocation.allocatedPaisa === 0) {
      throw ApiError.badRequest('Selected months have no outstanding balance', 'NOTHING_ALLOCATED');
    }

    const seq = await nextSequence('payment');
    const doc = new Payment({
      paymentNumber: `PAY-CR-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`,
      customer: enrollment.customer,
      enrollment: enrollment._id,
      tokenNumber: enrollment.tokenNumber,
      location: (await Customer.findById(enrollment.customer).session(session ?? null).lean())!.location,
      amountPaisa: 0,
      allocatedPaisa: allocation.allocatedPaisa,
      unallocatedPaisa: 0,
      allocations: allocation.allocations.map((a) => ({
        installment: new Types.ObjectId(a.installmentId),
        monthNumber: a.monthNumber,
        amountPaisa: a.amountPaisa,
      })),
      method: 'OTHER',
      paymentDate: new Date(),
      sourceType: 'CREDIT_ALLOCATION',
      notes: input.reason ?? 'Allocation of unallocated customer credit',
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await doc.save({ session });
    else await doc.save();

    for (const a of allocation.allocations) {
      await Installment.updateOne(
        { _id: new Types.ObjectId(a.installmentId) },
        { $inc: { paidPaisa: a.amountPaisa } },
        opts
      );
    }
    await recomputeEnrollment(enrollment._id, session, new Date());

    await writeAudit(
      {
        actor: user,
        action: 'ADJUSTMENT',
        entityType: 'Payment',
        entityId: String(doc._id),
        description: `Allocated ${allocation.allocatedPaisa / 100} PKR of customer credit to month(s) ${allocation.allocations.map((a) => a.monthNumber).join(', ')}`,
        reason: input.reason ?? 'Explicit credit allocation',
      },
      session
    );

    return serializeMoney(doc);
  });
}

export interface PaymentQuery {
  page?: number;
  limit?: number;
  customerId?: string;
  enrollmentId?: string;
  tokenNumber?: number;
  location?: 'MACH' | 'QUETTA';
  method?: string;
  status?: 'posted' | 'reversed';
  dateFrom?: Date;
  dateTo?: Date;
  includeReversals?: boolean;
}

export async function listPayments(query: PaymentQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 25));

  const filter: FilterQuery<unknown> = {};
  if (query.customerId) filter.customer = new Types.ObjectId(query.customerId);
  if (query.enrollmentId) filter.enrollment = new Types.ObjectId(query.enrollmentId);
  if (query.tokenNumber) filter.tokenNumber = query.tokenNumber;
  if (query.location) filter.location = query.location;
  if (query.method) filter.method = query.method;
  if (query.status) filter.status = query.status;
  else if (!query.includeReversals) filter.status = 'posted';
  if (query.dateFrom || query.dateTo) {
    filter.paymentDate = {};
    if (query.dateFrom) filter.paymentDate.$gte = query.dateFrom;
    if (query.dateTo) filter.paymentDate.$lte = query.dateTo;
  }

  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name cnic phone location')
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    items: items.map((p) => ({
      ...serializeMoney<Record<string, unknown>>(p),
      tokenCode: String(p.tokenNumber).padStart(3, '0'),
    })),
    pagination: { page, limit, total },
  };
}

export async function getReceipt(idOrNumber: string) {
  const query = Types.ObjectId.isValid(idOrNumber)
    ? { $or: [{ _id: idOrNumber }, { number: idOrNumber }] }
    : { number: idOrNumber };
  const receipt = await Receipt.findOne(query)
    .populate({ path: 'payment', populate: { path: 'customer', select: 'name cnic phone location customerCode' } })
    .populate('customer', 'name cnic phone location customerCode address')
    .lean();
  if (!receipt) throw ApiError.notFound('Receipt');
  return serializeMoney(receipt);
}

/** Cash movements that back a payment - used by the ledger trace report. */
export async function getPaymentCashTrail(paymentId: string) {
  if (!Types.ObjectId.isValid(paymentId)) throw ApiError.notFound('Payment');
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw ApiError.notFound('Payment');
  const ids = [payment._id];
  if (payment.reversedByPayment) ids.push(payment.reversedByPayment);
  const movements = await CashMovement.find({ sourceRef: { $in: ids } }).lean();
  return { payment: serializeMoney(payment), movements: serializeMoney(movements) };
}
