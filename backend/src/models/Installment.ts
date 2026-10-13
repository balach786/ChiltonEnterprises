import { Schema, model, Types } from 'mongoose';

export type InstallmentStatus =
  | 'unpaid'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'not_applicable'
  | 'adjusted';

/** One of the 28 scheduled monthly periods of an enrolment. */
export interface IInstallment {
  _id?: Types.ObjectId;
  enrollment: Types.ObjectId;
  customer: Types.ObjectId;
  tokenNumber: number;
  monthNumber: number;
  dueDate: Date;
  scheduledPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
  /** Amount waived / adjusted by an authorised correction (paisa). */
  adjustedPaisa: number;
  status: InstallmentStatus;
  /** Set when the period was stopped by a confirmed draw closure. */
  stoppedAfterDraw: boolean;
  notApplicableReason?: string;
  adjustmentReason?: string;
  lastPaymentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const installmentSchema = new Schema<IInstallment>(
  {
    enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    tokenNumber: { type: Number, required: true, index: true },
    monthNumber: { type: Number, required: true, min: 1 },
    dueDate: { type: Date, required: true, index: true },
    scheduledPaisa: { type: Number, required: true, min: 0 },
    paidPaisa: { type: Number, default: 0, min: 0 },
    outstandingPaisa: { type: Number, default: 0 },
    adjustedPaisa: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'overdue', 'not_applicable', 'adjusted'],
      default: 'unpaid',
      index: true,
    },
    stoppedAfterDraw: { type: Boolean, default: false, index: true },
    notApplicableReason: { type: String },
    adjustmentReason: { type: String },
    lastPaymentAt: { type: Date },
  },
  { timestamps: true }
);

/** Exactly one installment document per month per enrolment. */
installmentSchema.index({ enrollment: 1, monthNumber: 1 }, { unique: true });
installmentSchema.index({ customer: 1, monthNumber: 1 });
installmentSchema.index({ status: 1, dueDate: 1 });
installmentSchema.index({ tokenNumber: 1, monthNumber: 1 });

export const Installment = model<IInstallment>('Installment', installmentSchema);

/**
 * Pure derivation of an installment's status from its balances. Shared by the service
 * layer and the unit tests so the rules can never drift apart.
 *
 *  - not_applicable / adjusted are terminal and only changed by an authorised action.
 *  - paid when paid + adjusted >= scheduled
 *  - partial when 0 < paid + adjusted < scheduled
 *  - overdue when the due date has passed and the period is not fully settled
 *  - unpaid otherwise
 */
export function deriveInstallmentStatus(input: {
  scheduledPaisa: number;
  paidPaisa: number;
  adjustedPaisa: number;
  dueDate: Date;
  now?: Date;
  stoppedAfterDraw?: boolean;
}): InstallmentStatus {
  const now = input.now ?? new Date();
  if (input.stoppedAfterDraw) return 'not_applicable';
  const settled = (input.paidPaisa || 0) + (input.adjustedPaisa || 0);
  if (settled >= input.scheduledPaisa && input.scheduledPaisa > 0) {
    return input.adjustedPaisa > 0 ? 'adjusted' : 'paid';
  }
  if (input.scheduledPaisa === 0) return 'not_applicable';
  if (settled > 0) return 'partial';
  if (input.dueDate.getTime() < startOfToday(now).getTime()) return 'overdue';
  return 'unpaid';
}

function startOfToday(now: Date): Date {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}
