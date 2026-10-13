import { Schema, model, Types } from 'mongoose';

/**
 * Printable receipt. The number is generated from an atomic counter (see Counter.ts) and
 * a snapshot of the printable details is stored so a later correction never rewrites
 * what the customer was originally given.
 */
export interface IReceipt {
  _id?: Types.ObjectId;
  number: string;
  payment: Types.ObjectId;
  customer: Types.ObjectId;
  tokenNumber: number;
  customerName: string;
  amountPaisa: number;
  method: string;
  issuedAt: Date;
  issuedBy?: Types.ObjectId;
  issuedByName?: string;
  status: 'issued' | 'cancelled';
  detail: string;
  allocations: Array<{ monthNumber: number; amountPaisa: number }>;
}

const receiptSchema = new Schema<IReceipt>(
  {
    number: { type: String, required: true, unique: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    tokenNumber: { type: Number, required: true },
    customerName: { type: String, required: true },
    amountPaisa: { type: Number, required: true },
    method: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: Date.now, index: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedByName: { type: String },
    status: { type: String, enum: ['issued', 'cancelled'], default: 'issued', index: true },
    detail: { type: String },
    allocations: {
      type: [{ monthNumber: Number, amountPaisa: Number }],
      default: [],
      _id: false,
    },
  },
  { timestamps: true }
);

export const Receipt = model<IReceipt>('Receipt', receiptSchema);
