import { Schema, model, Types } from 'mongoose';

/**
 * Advance Bike / Advance Cash case (PRD section 7).
 *
 * Critical rule: an advance NEVER stops installments. `stopsInstallments` exists only so
 * the rule is explicit and testable, and it is always false unless a separate confirmed
 * draw closure or an authorised arrangement changes the obligation.
 */
export interface ICustomerAdvance {
  _id?: Types.ObjectId;
  advanceCode: string;
  customer: Types.ObjectId;
  enrollment: Types.ObjectId;
  tokenNumber: number;
  location: 'MACH' | 'QUETTA';
  type: 'BIKE' | 'CASH';
  advanceDate: Date;
  /** Cash amount (CASH) or agreed bike valuation (BIKE), in paisa. */
  amountPaisa: number;
  /** Advance Bike description: model / chassis / engine number. */
  bikeDescription?: string;
  bikeModel?: string;
  chassisNumber?: string;
  engineNumber?: string;
  method?: string;
  purpose?: string;
  status: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
  /** Always false: advances do not stop installments by themselves. */
  stopsInstallments: boolean;
  authorizedBy?: string;
  approver?: string;
  approverUser?: Types.ObjectId;
  /** Reference of the linked financial document, so the money moves exactly once. */
  expenseTransaction?: Types.ObjectId;
  cashMovement?: Types.ObjectId;
  supportingReference?: string;
  attachments: Array<{ name: string; url: string; uploadedAt: Date }>;
  settlementNotes?: string;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const advanceSchema = new Schema<ICustomerAdvance>(
  {
    advanceCode: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', required: true, index: true },
    tokenNumber: { type: Number, required: true, index: true },
    location: { type: String, enum: ['MACH', 'QUETTA'], required: true, index: true },
    type: { type: String, enum: ['BIKE', 'CASH'], required: true, index: true },
    advanceDate: { type: Date, required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    bikeDescription: { type: String, maxlength: 500 },
    bikeModel: { type: String, maxlength: 120 },
    chassisNumber: { type: String, maxlength: 60 },
    engineNumber: { type: String, maxlength: 60 },
    method: { type: String },
    purpose: { type: String, maxlength: 500 },
    status: { type: String, enum: ['ACTIVE', 'SETTLED', 'CANCELLED'], default: 'ACTIVE', index: true },
    stopsInstallments: { type: Boolean, default: false, immutable: true },
    authorizedBy: { type: String },
    approver: { type: String },
    approverUser: { type: Schema.Types.ObjectId, ref: 'User' },
    expenseTransaction: { type: Schema.Types.ObjectId, ref: 'ExpenseTransaction' },
    cashMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    supportingReference: { type: String, maxlength: 120 },
    attachments: {
      type: [{ name: String, url: String, uploadedAt: { type: Date, default: Date.now } }],
      default: [],
      _id: false,
    },
    settlementNotes: { type: String, maxlength: 1000 },
    notes: { type: String, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

advanceSchema.index({ type: 1, status: 1, advanceDate: -1 });

export const CustomerAdvance = model<ICustomerAdvance>('CustomerAdvance', advanceSchema);
