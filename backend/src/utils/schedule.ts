import { addMonths } from './money';
import { deriveInstallmentStatus, InstallmentStatus } from '../models/Installment';

/**
 * Pure business maths for the 28-month installment scheme.
 * Kept free of any database access so it can be unit tested directly.
 */

export interface ScheduleRow {
  monthNumber: number;
  dueDate: Date;
  scheduledPaisa: number;
}

export interface BuildScheduleInput {
  startDate: Date;
  monthlyInstallmentPaisa: number;
  /** 28 for the standard scheme (PRD p.3). */
  durationMonths: number;
  /** Optional fixed day-of-month for every due date (1-28), otherwise anniversary based. */
  dueDayOfMonth?: number | null;
}

/**
 * Builds the installment schedule.
 *
 * Rules implemented (PRD section 5):
 *  - exactly `durationMonths` periods are produced;
 *  - every period uses the SAME fixed monthly amount for that customer;
 *  - the sum of the periods equals monthly x duration exactly (integer paisa).
 */
export function buildSchedule(input: BuildScheduleInput): ScheduleRow[] {
  const { startDate, durationMonths } = input;
  const monthly = Math.round(input.monthlyInstallmentPaisa);
  if (!Number.isFinite(monthly) || monthly <= 0) {
    throw new Error('monthlyInstallmentPaisa must be a positive integer (paisa)');
  }
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    throw new Error('durationMonths must be a positive integer');
  }

  const rows: ScheduleRow[] = [];
  for (let month = 1; month <= durationMonths; month += 1) {
    const base = addMonths(startDate, month - 1);
    let dueDate = base;
    if (input.dueDayOfMonth) {
      const day = Math.min(Math.max(1, Math.round(input.dueDayOfMonth)), 28);
      dueDate = new Date(base.getFullYear(), base.getMonth(), day);
    }
    rows.push({ monthNumber: month, dueDate, scheduledPaisa: monthly });
  }
  return rows;
}

/** schemeTotal = monthly x duration (+ separately recorded fees/adjustments). */
export function schemeTotalPaisa(monthlyInstallmentPaisa: number, durationMonths: number): number {
  return Math.round(monthlyInstallmentPaisa) * Math.round(durationMonths);
}

export interface AllocationTarget {
  installmentId: string;
  monthNumber: number;
  scheduledPaisa: number;
  paidPaisa: number;
  adjustedPaisa: number;
  status: InstallmentStatus;
}

export interface AllocationResult {
  allocations: Array<{ installmentId: string; monthNumber: number; amountPaisa: number }>;
  allocatedPaisa: number;
  unallocatedPaisa: number;
  rejected: Array<{ installmentId: string; monthNumber: number; reason: string }>;
}

/**
 * Allocates a payment across the requested installment periods.
 *
 * Rules (PRD p.8):
 *  - never allocates more than the remaining balance of a period;
 *  - never silently spills an overpayment into another month: whatever cannot be
 *    allocated is returned as `unallocatedPaisa` (a customer credit);
 *  - periods stopped by a draw closure ("not applicable") can never receive money.
 */
export function allocatePayment(
  targets: AllocationTarget[],
  amountPaisa: number,
  options: { allowPartial?: boolean; allowOverpay?: boolean } = {}
): AllocationResult {
  const allowPartial = options.allowPartial ?? true;
  const allowOverpay = options.allowOverpay ?? true;

  let remaining = Math.round(amountPaisa);
  const allocations: AllocationResult['allocations'] = [];
  const rejected: AllocationResult['rejected'] = [];

  const ordered = [...targets].sort((a, b) => a.monthNumber - b.monthNumber);

  for (const t of ordered) {
    if (remaining <= 0) break;

    if (t.status === 'not_applicable' || t.status === 'adjusted') {
      rejected.push({
        installmentId: t.installmentId,
        monthNumber: t.monthNumber,
        reason: `Installment ${t.monthNumber} is ${t.status.replace('_', ' ')} and cannot receive a payment`,
      });
      continue;
    }

    const balance = t.scheduledPaisa - (t.paidPaisa + t.adjustedPaisa);
    if (balance <= 0) {
      rejected.push({
        installmentId: t.installmentId,
        monthNumber: t.monthNumber,
        reason: `Installment ${t.monthNumber} is already fully paid`,
      });
      continue;
    }

    const take = Math.min(balance, remaining);
    if (!allowPartial && take < balance) {
      rejected.push({
        installmentId: t.installmentId,
        monthNumber: t.monthNumber,
        reason: `Partial payments are disabled; installment ${t.monthNumber} needs the full ${balance / 100} PKR`,
      });
      continue;
    }

    allocations.push({ installmentId: t.installmentId, monthNumber: t.monthNumber, amountPaisa: take });
    remaining -= take;
  }

  if (remaining > 0 && !allowOverpay) {
    throw new Error('Payment exceeds the selected installment balance and overpayments are disabled');
  }

  const allocatedPaisa = allocations.reduce((sum, a) => sum + a.amountPaisa, 0);
  return { allocations, allocatedPaisa, unallocatedPaisa: remaining, rejected };
}

export interface TotalsInput {
  installments: Array<{
    monthNumber: number;
    scheduledPaisa: number;
    paidPaisa: number;
    adjustedPaisa: number;
    status: InstallmentStatus;
    dueDate: Date;
    stoppedAfterDraw?: boolean;
  }>;
  feesPaisa?: number;
  adjustmentsPaisa?: number;
}

/**
 * Derives the enrolment-level totals from the installment ledger.
 *  - totalPaid   = sum of allocated payments
 *  - payable     = sum of scheduled amounts of periods that are still payable
 *                  (periods stopped by a closure are excluded)
 *  - outstanding = payable - paid - adjusted, never negative
 */
export function computeTotals(input: TotalsInput) {
  let totalPaid = 0;
  let payableTotal = 0;
  let adjustedTotal = 0;
  let notApplicableCount = 0;
  let lastPayableMonth = 0;

  for (const i of input.installments) {
    totalPaid += i.paidPaisa;
    adjustedTotal += i.adjustedPaisa;
    if (i.status === 'not_applicable' || i.stoppedAfterDraw) {
      notApplicableCount += 1;
      continue;
    }
    payableTotal += i.scheduledPaisa;
    if (i.monthNumber > lastPayableMonth) lastPayableMonth = i.monthNumber;
  }

  const payableAfterAdjustments = Math.max(0, payableTotal - adjustedTotal);
  const outstanding = Math.max(0, payableAfterAdjustments - totalPaid);

  return {
    totalPaidPaisa: totalPaid,
    payableTotalPaisa: payableTotal,
    adjustedTotalPaisa: adjustedTotal,
    outstandingPaisa: outstanding,
    notApplicableCount,
    lastPayableMonth,
    remainingScheduledPaisa: outstanding,
  };
}

/** Counts by status - used by the dashboard and the customer overview tab. */
export function countByStatus(installments: Array<{ status: InstallmentStatus }>) {
  const counts: Record<InstallmentStatus, number> = {
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
    not_applicable: 0,
    adjusted: 0,
  };
  for (const i of installments) counts[i.status] = (counts[i.status] ?? 0) + 1;
  return counts;
}

export { deriveInstallmentStatus };
