import { Schema, model, Types } from 'mongoose';
import { SCHEME } from '../constants';

/**
 * One enrolment = one customer holding one token for one 28-month scheme.
 * Re-using a token for a later scheme creates a NEW enrolment document, so the previous
 * scheme's history is never destroyed (PRD p.7 token lifecycle).
 */
export interface ISchemeEnrollment {
  _id?: Types.ObjectId;
  enrollmentCode: string;
  schemeCode: string;
  customer: Types.ObjectId;
  token: Types.ObjectId;
  tokenNumber: number;
  startDate: Date;
  /** Fixed monthly installment for this enrolment, in paisa. */
  monthlyInstallmentPaisa: number;
  durationMonths: number;
  /** monthlyInstallment * durationMonths, in paisa. */
  schemeTotalPaisa: number;
  /** Separately recorded fees / waivers / adjustments, in paisa. */
  feesPaisa: number;
  adjustmentsPaisa: number;
  status: 'active' | 'drawn_closed' | 'cancelled';
  /** Denormalised totals, always recomputed from the installment ledger. */
  totalPaidPaisa: number;
  payableTotalPaisa: number;
  outstandingPaisa: number;
  closedAt?: Date;
  closure?: Types.ObjectId;
  drawEvent?: Types.ObjectId;
  /** Highest month number whose installment is not "not applicable". */
  lastPayableMonth?: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<ISchemeEnrollment>(
  {
    enrollmentCode: { type: String, required: true, unique: true, index: true },
    schemeCode: { type: String, required: true, default: 'S1', index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    token: { type: Schema.Types.ObjectId, ref: 'Token', required: true, index: true },
    tokenNumber: { type: Number, required: true, min: 1, max: SCHEME.TOTAL_TOKEN_SLOTS, index: true },
    startDate: { type: Date, required: true },
    monthlyInstallmentPaisa: { type: Number, required: true, min: 1 },
    durationMonths: {
      type: Number,
      required: true,
      default: SCHEME.INSTALLMENT_MONTHS,
      min: 1,
      max: 120,
    },
    schemeTotalPaisa: { type: Number, required: true, min: 0 },
    feesPaisa: { type: Number, default: 0 },
    adjustmentsPaisa: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'drawn_closed', 'cancelled'], default: 'active', index: true },
    totalPaidPaisa: { type: Number, default: 0, min: 0 },
    payableTotalPaisa: { type: Number, default: 0, min: 0 },
    outstandingPaisa: { type: Number, default: 0 },
    closedAt: { type: Date },
    closure: { type: Schema.Types.ObjectId, ref: 'CustomerClosure' },
    drawEvent: { type: Schema.Types.ObjectId, ref: 'DrawEvent' },
    lastPayableMonth: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/**
 * A token may only be held by one ACTIVE enrolment per scheme (PRD acceptance: duplicate
 * token). The index is partial so that a closed enrolment keeps its history and the token
 * can be re-issued for a later scheme (PRD p.7 token lifecycle step 5).
 */
enrollmentSchema.index(
  { token: 1, schemeCode: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_token_per_scheme_active' }
);
/** Only one ACTIVE enrolment per token, enforced at the database level. */
enrollmentSchema.index(
  { token: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_active_token' }
);
enrollmentSchema.index({ status: 1, tokenNumber: 1 });

export const SchemeEnrollment = model<ISchemeEnrollment>('SchemeEnrollment', enrollmentSchema);
