import { Schema, model, Types } from 'mongoose';

/**
 * Cash <-> bank transfer. A transfer creates two opposing movements and is never income
 * or expense (PRD p.13).
 */
export interface ITransfer {
  _id?: Types.ObjectId;
  transferId: string;
  fromAccount: Types.ObjectId;
  fromAccountName: string;
  toAccount: Types.ObjectId;
  toAccountName: string;
  amountPaisa: number;
  transferDate: Date;
  method?: string;
  reference?: string;
  notes?: string;
  status: 'posted' | 'reversed';
  outMovement?: Types.ObjectId;
  inMovement?: Types.ObjectId;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const transferSchema = new Schema<ITransfer>(
  {
    transferId: { type: String, required: true, unique: true, index: true },
    fromAccount: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', required: true, index: true },
    fromAccountName: { type: String, required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', required: true, index: true },
    toAccountName: { type: String, required: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    transferDate: { type: Date, required: true, index: true },
    method: { type: String },
    reference: { type: String, maxlength: 120 },
    notes: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    outMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    inMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

export const Transfer = model<ITransfer>('Transfer', transferSchema);
