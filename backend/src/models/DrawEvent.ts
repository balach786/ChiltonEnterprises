import { Schema, model, Types } from 'mongoose';
import { SCHEME } from '../constants';

export interface IEligibleSnapshot {
  _id?: Types.ObjectId;
  enrollment: Types.ObjectId;
  customer: Types.ObjectId;
  tokenNumber: number;
  customerName: string;
  location: 'MACH' | 'QUETTA';
  installmentsPaid: number;
  outstandingPaisa: number;
}

export interface ICorrectionRecord {
  _id?: Types.ObjectId;
  correctedAt: Date;
  correctedBy?: Types.ObjectId;
  correctedByName?: string;
  reason: string;
  originalValue: unknown;
  correctedValue: unknown;
}

/**
 * Monthly Qurandazi (draw) register. The eligible list is snapshotted at draw time and
 * a confirmed result is never silently changed - corrections append a record that keeps
 * both the original and the corrected value (PRD p.9).
 */
export interface IDrawEvent {
  _id?: Types.ObjectId;
  schemeCode: string;
  schemeMonth: number;
  drawDate: Date;
  eligibleSnapshot: IEligibleSnapshot[];
  eligibleCount: number;
  winnerEnrollment?: Types.ObjectId;
  winnerCustomer?: Types.ObjectId;
  winnerTokenNumber?: number;
  winnerName?: string;
  reference?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CORRECTED' | 'VOIDED';
  operator?: Types.ObjectId;
  operatorName?: string;
  approvedBy?: Types.ObjectId;
  approvedByName?: string;
  confirmedAt?: Date;
  witnesses?: string[];
  notes?: string;
  closure?: Types.ObjectId;
  corrections: ICorrectionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const drawEventSchema = new Schema<IDrawEvent>(
  {
    schemeCode: { type: String, default: 'S1', index: true },
    schemeMonth: { type: Number, required: true, min: 1, max: SCHEME.INSTALLMENT_MONTHS, index: true },
    drawDate: { type: Date, required: true, index: true },
    eligibleSnapshot: {
      type: [
        {
          enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment' },
          customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
          tokenNumber: Number,
          customerName: String,
          location: { type: String, enum: ['MACH', 'QUETTA'] },
          installmentsPaid: Number,
          outstandingPaisa: Number,
        },
      ],
      default: [],
      _id: false,
    },
    eligibleCount: { type: Number, default: 0 },
    winnerEnrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', index: true },
    winnerCustomer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    winnerTokenNumber: { type: Number, min: 1, max: SCHEME.TOTAL_TOKEN_SLOTS },
    winnerName: { type: String },
    reference: { type: String, trim: true },
    status: {
      type: String,
      enum: ['DRAFT', 'CONFIRMED', 'CORRECTED', 'VOIDED'],
      default: 'DRAFT',
      index: true,
    },
    operator: { type: Schema.Types.ObjectId, ref: 'User' },
    operatorName: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String },
    confirmedAt: { type: Date },
    witnesses: { type: [String], default: [] },
    notes: { type: String, maxlength: 2000 },
    closure: { type: Schema.Types.ObjectId, ref: 'CustomerClosure' },
    corrections: {
      type: [
        {
          correctedAt: { type: Date, default: Date.now },
          correctedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          correctedByName: String,
          reason: { type: String, required: true },
          originalValue: Schema.Types.Mixed,
          correctedValue: Schema.Types.Mixed,
        },
      ],
      default: [],
      _id: false,
    },
  },
  { timestamps: true }
);

/** One confirmed winner per scheme month per scheme. */
drawEventSchema.index(
  { schemeCode: 1, schemeMonth: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['CONFIRMED', 'CORRECTED'] } }, name: 'uniq_confirmed_month' }
);
drawEventSchema.index({ drawDate: -1, schemeMonth: 1 });

export const DrawEvent = model<IDrawEvent>('DrawEvent', drawEventSchema);
