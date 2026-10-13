import { Schema, model, Types } from 'mongoose';

/**
 * Daily closing / reconciliation (PRD p.13).
 * difference = systemCalculated - actualCounted.
 */
export interface IReconciliation {
  _id?: Types.ObjectId;
  account: Types.ObjectId;
  accountName: string;
  accountType: 'CASH' | 'BANK';
  closingDate: Date;
  openingBalancePaisa: number;
  totalInPaisa: number;
  totalOutPaisa: number;
  systemCalculatedPaisa: number;
  actualCountedPaisa: number;
  differencePaisa: number;
  notes?: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
  approvedBy?: Types.ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reconciliationSchema = new Schema<IReconciliation>(
  {
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', required: true, index: true },
    accountName: { type: String, required: true },
    accountType: { type: String, enum: ['CASH', 'BANK'], required: true },
    closingDate: { type: Date, required: true, index: true },
    openingBalancePaisa: { type: Number, required: true },
    totalInPaisa: { type: Number, default: 0 },
    totalOutPaisa: { type: Number, default: 0 },
    systemCalculatedPaisa: { type: Number, required: true },
    actualCountedPaisa: { type: Number, required: true },
    differencePaisa: { type: Number, required: true },
    notes: { type: String, maxlength: 2000 },
    status: { type: String, enum: ['OPEN', 'APPROVED', 'REJECTED'], default: 'OPEN', index: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByName: { type: String },
    approvedAt: { type: Date },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

/** One closing record per account per day. */
reconciliationSchema.index({ account: 1, closingDate: 1 }, { unique: true, name: 'uniq_closing_per_day' });

export const Reconciliation = model<IReconciliation>('Reconciliation', reconciliationSchema);
