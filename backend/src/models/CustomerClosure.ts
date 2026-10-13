import { Schema, model, Types } from 'mongoose';

/**
 * Account closure. Created when a draw is confirmed (or by another authorised reason).
 * Confirmation is what stops future installments - an advance arrangement never does
 * (PRD p.9).
 */
export interface ICustomerClosure {
  _id?: Types.ObjectId;
  customer: Types.ObjectId;
  enrollment: Types.ObjectId;
  tokenNumber: number;
  reason: 'DRAW_WIN' | 'AUTHORIZED_CLOSURE' | 'OTHER';
  drawEvent?: Types.ObjectId;
  /** Month number after which installments stop (months > stoppedFromMonth are N/A). */
  stoppedFromMonth: number;
  closedAt: Date;
  totalPaidPaisa: number;
  outstandingWaivedPaisa: number;
  finalSettlementNotes?: string;
  closedBy?: Types.ObjectId;
  closedByName?: string;
  approvedBy?: Types.ObjectId;
  approvedByName?: string;
  /** Set when an authorised draw correction re-opens the account. The record is kept. */
  status: 'ACTIVE' | 'VOIDED';
  voidedAt?: Date;
  voidedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const closureSchema = new Schema<ICustomerClosure>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', required: true, index: true },
    tokenNumber: { type: Number, required: true, index: true },
    reason: {
      type: String,
      enum: ['DRAW_WIN', 'AUTHORIZED_CLOSURE', 'OTHER'],
      default: 'DRAW_WIN',
      index: true,
    },
    drawEvent: { type: Schema.Types.ObjectId, ref: 'DrawEvent' },
    stoppedFromMonth: { type: Number, required: true, min: 0 },
    closedAt: { type: Date, required: true, default: Date.now, index: true },
    totalPaidPaisa: { type: Number, default: 0 },
    outstandingWaivedPaisa: { type: Number, default: 0 },
    finalSettlementNotes: { type: String, maxlength: 2000 },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedByName: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String },
    status: { type: String, enum: ['ACTIVE', 'VOIDED'], default: 'ACTIVE', index: true },
    voidedAt: { type: Date },
    voidedReason: { type: String },
  },
  { timestamps: true }
);

/** An enrolment can only carry ONE active closure; voided closures stay for the audit trail. */
closureSchema.index(
  { enrollment: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'uniq_active_closure_per_enrollment' }
);

export const CustomerClosure = model<ICustomerClosure>('CustomerClosure', closureSchema);
