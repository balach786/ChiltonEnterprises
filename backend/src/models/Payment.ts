import { Schema, model, Types } from 'mongoose';
import { PAYMENT_METHODS } from '../constants';

export interface IPaymentAllocation {
  _id?: Types.ObjectId;
  installment: Types.ObjectId;
  monthNumber: number;
  amountPaisa: number;
}

/**
 * A customer payment. One payment = one receipt = at most one cash movement.
 * Reversals never delete: a reversing payment references the original and both records
 * stay queryable (PRD p.8 "reversed or adjusted ... rather than deleted").
 */
export interface IPayment {
  _id?: Types.ObjectId;
  paymentNumber: string;
  receipt?: Types.ObjectId;
  customer: Types.ObjectId;
  enrollment: Types.ObjectId;
  tokenNumber: number;
  location: 'MACH' | 'QUETTA';
  amountPaisa: number;
  allocatedPaisa: number;
  /** Overpayment held as an unallocated customer credit (PRD p.8). */
  unallocatedPaisa: number;
  allocations: IPaymentAllocation[];
  method: (typeof PAYMENT_METHODS)[number];
  account?: Types.ObjectId;
  accountName?: string;
  paymentDate: Date;
  sourceType: 'INSTALLMENT' | 'OTHER' | 'CREDIT_ALLOCATION' | 'REVERSAL';
  notes?: string;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  status: 'posted' | 'reversed';
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
  /** The payment document that reversed this one. */
  reversedByPayment?: Types.ObjectId;
  /** When this document IS the reversal, it points at the original. */
  reversesPayment?: Types.ObjectId;
  cashMovement?: Types.ObjectId;
  incomeTransaction?: Types.ObjectId;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true, index: true },
    receipt: { type: Schema.Types.ObjectId, ref: 'Receipt' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', required: true, index: true },
    tokenNumber: { type: Number, required: true, index: true },
    location: { type: String, enum: ['MACH', 'QUETTA'], required: true, index: true },
    amountPaisa: { type: Number, required: true },
    allocatedPaisa: { type: Number, default: 0 },
    unallocatedPaisa: { type: Number, default: 0 },
    allocations: {
      type: [
        {
          installment: { type: Schema.Types.ObjectId, ref: 'Installment', required: true },
          monthNumber: { type: Number, required: true },
          amountPaisa: { type: Number, required: true },
        },
      ],
      default: [],
      _id: false,
    },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: 'CASH' },
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', index: true },
    accountName: { type: String },
    paymentDate: { type: Date, required: true, index: true },
    sourceType: {
      type: String,
      enum: ['INSTALLMENT', 'OTHER', 'CREDIT_ALLOCATION', 'REVERSAL'],
      default: 'INSTALLMENT',
      index: true,
    },
    notes: { type: String, maxlength: 1000 },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    reversedAt: { type: Date },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String },
    reversedByPayment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    reversesPayment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    cashMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    incomeTransaction: { type: Schema.Types.ObjectId, ref: 'IncomeTransaction' },
    // Unique on purpose: the "is this key already used?" check inside the transaction is not
    // enough on its own, because two concurrent requests can both read "not used" before either
    // inserts. The unique index makes the second insert fail, and the service replays the first.
    // Sparse so the many payments that carry no key are unaffected.
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

paymentSchema.index({ customer: 1, paymentDate: -1 });
paymentSchema.index({ status: 1, paymentDate: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);
