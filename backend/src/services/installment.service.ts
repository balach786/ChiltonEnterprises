import { ClientSession, FilterQuery, Types } from 'mongoose';
import {
  deriveInstallmentStatus,
  IInstallment,
  Installment,
  SchemeEnrollment,
  Token,
} from '../models';
import { computeTotals } from '../utils/schedule';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { startOfDay } from '../utils/money';
import { writeAudit } from './audit.service';
import { AuthUser } from '../types/express';

/** Recomputes every installment status and the enrolment totals from the ledger. */
export async function recomputeEnrollment(
  enrollmentId: Types.ObjectId | string,
  session: ClientSession | null = null,
  now: Date = new Date()
) {
  const opts = session ? { session } : {};
  const enrollment = await SchemeEnrollment.findById(enrollmentId).session(session ?? null).lean();
  if (!enrollment) throw ApiError.notFound('Enrollment');

  const installments = await Installment.find({ enrollment: enrollment._id })
    .session(session ?? null)
    .lean();

  for (const inst of installments) {
    const status = deriveInstallmentStatus({
      scheduledPaisa: inst.scheduledPaisa,
      paidPaisa: inst.paidPaisa,
      adjustedPaisa: inst.adjustedPaisa,
      dueDate: inst.dueDate,
      stoppedAfterDraw: inst.stoppedAfterDraw,
      now,
    });
    // A period stopped by a confirmed draw closure is no longer payable, so it never
    // carries an outstanding balance (PRD p.8 customer statement calculations).
    const outstanding = inst.stoppedAfterDraw
      ? 0
      : Math.max(0, inst.scheduledPaisa - inst.paidPaisa - inst.adjustedPaisa);
    if (status !== inst.status || outstanding !== inst.outstandingPaisa) {
      await Installment.updateOne(
        { _id: inst._id },
        { $set: { status, outstandingPaisa: outstanding } },
        opts
      );
      inst.status = status;
      inst.outstandingPaisa = outstanding;
    }
  }

  const totals = computeTotals({
    installments: installments.map((i) => ({
      monthNumber: i.monthNumber,
      scheduledPaisa: i.scheduledPaisa,
      paidPaisa: i.paidPaisa,
      adjustedPaisa: i.adjustedPaisa,
      status: i.status,
      dueDate: i.dueDate,
      stoppedAfterDraw: i.stoppedAfterDraw,
    })),
  });

  await SchemeEnrollment.updateOne(
    { _id: enrollment._id },
    {
      $set: {
        totalPaidPaisa: totals.totalPaidPaisa,
        payableTotalPaisa: totals.payableTotalPaisa,
        outstandingPaisa: totals.outstandingPaisa,
        lastPayableMonth: totals.lastPayableMonth || undefined,
      },
    },
    opts
  );

  return { enrollmentId: String(enrollment._id), ...totals };
}

/**
 * CRITICAL BUSINESS RULE (PRD p.8): a confirmed draw closure stops ALL future
 * installments. Months after `stoppedFromMonth` become `not_applicable` and are flagged
 * `stoppedAfterDraw` so they never appear as unpaid or overdue.
 */
export async function stopFutureInstallments(input: {
  enrollmentId: Types.ObjectId | string;
  stoppedFromMonth: number;
  reason: string;
  session: ClientSession | null;
  now?: Date;
}) {
  const opts = input.session ? { session: input.session } : {};
  const result = await Installment.updateMany(
    { enrollment: input.enrollmentId, monthNumber: { $gt: input.stoppedFromMonth } },
    {
      $set: {
        status: 'not_applicable',
        stoppedAfterDraw: true,
        notApplicableReason: input.reason,
        outstandingPaisa: 0,
      },
    },
    opts
  );
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

/** Marks past-due unpaid/partly paid installments as overdue. Safe to run on a schedule. */
export async function refreshOverdueStatuses(now: Date = new Date(), session: ClientSession | null = null) {
  const cutoff = startOfDay(now);
  const res = await Installment.updateMany(
    {
      status: { $in: ['unpaid', 'partial'] },
      stoppedAfterDraw: { $ne: true },
      dueDate: { $lt: cutoff },
    },
    { $set: { status: 'overdue' } },
    session ? { session } : {}
  );
  return res.modifiedCount;
}

export interface InstallmentQuery {
  page?: number;
  limit?: number;
  enrollmentId?: string;
  customerId?: string;
  tokenNumber?: number;
  status?: string;
  monthNumber?: number;
  includeStopped?: boolean;
  dueBefore?: Date;
  dueAfter?: Date;
}

export async function listInstallments(query: InstallmentQuery) {
  const filter: FilterQuery<IInstallment> = {};
  if (query.enrollmentId) filter.enrollment = new Types.ObjectId(query.enrollmentId);
  if (query.customerId) filter.customer = new Types.ObjectId(query.customerId);
  if (query.tokenNumber) filter.tokenNumber = query.tokenNumber;
  if (query.status) filter.status = query.status;
  if (query.monthNumber) filter.monthNumber = query.monthNumber;
  if (!query.includeStopped) filter.stoppedAfterDraw = { $ne: true };
  if (query.dueBefore || query.dueAfter) {
    filter.dueDate = {};
    if (query.dueBefore) filter.dueDate.$lte = query.dueBefore;
    if (query.dueAfter) filter.dueDate.$gte = query.dueAfter;
  }

  // One enrollment is exactly 28 rows, so a schedule request never needs a page size.
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(
    500,
    Math.max(1, Number(query.limit ?? (query.enrollmentId || query.customerId ? 28 : 25)))
  );

  const [docs, total, agg] = await Promise.all([
    Installment.find(filter)
      .sort({ tokenNumber: 1, monthNumber: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name location cnic phone status')
      .lean(),
    Installment.countDocuments(filter),
    Installment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          scheduled: { $sum: '$scheduledPaisa' },
          paid: { $sum: '$paidPaisa' },
          outstanding: { $sum: '$outstandingPaisa' },
        },
      },
    ]),
  ]);

  const t = agg[0] ?? { scheduled: 0, paid: 0, outstanding: 0 };
  return {
    items: docs.map((i) => ({
      ...serializeMoney<Record<string, unknown>>(i),
      tokenCode: String(i.tokenNumber).padStart(3, '0'),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    totals: {
      count: total,
      scheduledPaisa: t.scheduled,
      paidPaisa: t.paid,
      outstandingPaisa: t.outstanding,
    },
  };
}

/**
 * Authorised adjustment / waiver of an installment (PRD p.8 "Adjusted" status).
 * The original scheduled amount is preserved; the adjustment is stored separately and
 * audited with a mandatory reason.
 */
export async function adjustInstallment(input: {
  installmentId: string;
  adjustedPkr: number;
  reason: string;
  user: AuthUser;
}) {
  if (!input.reason?.trim()) throw ApiError.badRequest('A reason is required for an adjustment');
  if (!Types.ObjectId.isValid(input.installmentId)) throw ApiError.notFound('Installment');

  const before = await Installment.findById(input.installmentId).lean();
  if (!before) throw ApiError.notFound('Installment');

  const adjustedPaisa = Math.round(input.adjustedPkr * 100);
  if (adjustedPaisa < 0 || adjustedPaisa > before.scheduledPaisa - before.paidPaisa) {
    throw ApiError.badRequest(
      'Adjustment must be between 0 and the outstanding balance of the installment',
      'INVALID_ADJUSTMENT'
    );
  }

  const updated = await Installment.findByIdAndUpdate(
    input.installmentId,
    {
      $set: {
        adjustedPaisa,
        adjustmentReason: input.reason,
        status: deriveInstallmentStatus({
          scheduledPaisa: before.scheduledPaisa,
          paidPaisa: before.paidPaisa,
          adjustedPaisa,
          dueDate: before.dueDate,
          stoppedAfterDraw: before.stoppedAfterDraw,
        }),
        outstandingPaisa: Math.max(0, before.scheduledPaisa - before.paidPaisa - adjustedPaisa),
      },
    },
    { new: true }
  ).lean();

  await writeAudit({
    actor: input.user,
    action: 'ADJUSTMENT',
    entityType: 'Installment',
    entityId: input.installmentId,
    description: `Adjusted installment ${before.monthNumber} by ${adjustedPaisa / 100} PKR`,
    previousValue: { adjustedPaisa: before.adjustedPaisa, status: before.status },
    newValue: { adjustedPaisa, status: updated?.status },
    reason: input.reason,
  });

  await recomputeEnrollment(before.enrollment);
  return serializeMoney(updated);
}

export async function getInstallmentsForCustomer(customerId: string) {
  if (!Types.ObjectId.isValid(customerId)) throw ApiError.notFound('Customer');
  return listInstallments({ customerId, includeStopped: true });
}

/** Token register row helper reused by reports. */
export async function tokenLabel(tokenNumber: number): Promise<string> {
  const t = await Token.findOne({ number: tokenNumber }).select('code').lean();
  return t?.code ?? String(tokenNumber).padStart(3, '0');
}
