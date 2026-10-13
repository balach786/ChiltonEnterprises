import { Schema, model, Types } from 'mongoose';
import { PAYMENT_METHODS } from '../constants';

/**
 * Incoming money. Customer installment collections are represented by the Payment
 * document and linked here through `sourceType: 'CUSTOMER_PAYMENT'` - they are never
 * entered twice as a separate income record (PRD p.10 "No duplicate entry").
 */
export interface IIncomeTransaction {
  _id?: Types.ObjectId;
  transactionId: string;
  category: string;
  amountPaisa: number;
  method: (typeof PAYMENT_METHODS)[number];
  account?: Types.ObjectId;
  accountName?: string;
  transactionDate: Date;
  customer?: Types.ObjectId;
  tokenNumber?: number;
  location?: 'MACH' | 'QUETTA';
  /** True only for categories that count as business revenue. */
  isRevenue: boolean;
  sourceType: 'MANUAL' | 'CUSTOMER_PAYMENT' | 'PARTNER_CONTRIBUTION' | 'LOAN';
  sourceRef?: Types.ObjectId;
  receiptNumber?: string;
  reference?: string;
  notes?: string;
  status: 'posted' | 'reversed';
  reversedAt?: Date;
  reversalReason?: string;
  cashMovement?: Types.ObjectId;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const incomeSchema = new Schema<IIncomeTransaction>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    // Negative values are reversal mirrors of an original record; the service layer
    // rejects negative input for new entries.
    amountPaisa: { type: Number, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: 'CASH' },
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', index: true },
    accountName: { type: String },
    transactionDate: { type: Date, required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    tokenNumber: { type: Number, index: true },
    location: { type: String, enum: ['MACH', 'QUETTA'], index: true },
    isRevenue: { type: Boolean, default: false, index: true },
    sourceType: {
      type: String,
      enum: ['MANUAL', 'CUSTOMER_PAYMENT', 'PARTNER_CONTRIBUTION', 'LOAN'],
      default: 'MANUAL',
      index: true,
    },
    sourceRef: { type: Schema.Types.ObjectId },
    receiptNumber: { type: String },
    reference: { type: String, maxlength: 120 },
    notes: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    reversedAt: { type: Date },
    reversalReason: { type: String },
    cashMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

incomeSchema.index({ transactionDate: -1, category: 1 });
/** One income mirror per customer payment - the database enforces the no-double-count rule. */
incomeSchema.index(
  { sourceType: 1, sourceRef: 1 },
  { unique: true, partialFilterExpression: { sourceType: 'CUSTOMER_PAYMENT' }, name: 'uniq_payment_income' }
);

export const IncomeTransaction = model<IIncomeTransaction>('IncomeTransaction', incomeSchema);
