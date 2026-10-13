import { Schema, model, Types } from 'mongoose';
import { PAYMENT_METHODS } from '../constants';

/**
 * Outgoing money that is NOT a customer installment reversal.
 *
 * `isOperatingExpense` is derived from the category: customer advance cash and partner
 * withdrawals are cash outflows but never operating expenses (PRD p.12 accounting note).
 */
export interface IExpenseTransaction {
  _id?: Types.ObjectId;
  transactionId: string;
  category: string;
  subCategory?: string;
  amountPaisa: number;
  isOperatingExpense: boolean;
  method: (typeof PAYMENT_METHODS)[number];
  account?: Types.ObjectId;
  accountName?: string;
  transactionDate: Date;
  paidTo?: string;
  partner?: Types.ObjectId;
  partnerName?: string;
  customer?: Types.ObjectId;
  tokenNumber?: number;
  location?: 'MACH' | 'QUETTA';
  purpose?: string;
  attachment?: { name: string; url: string; uploadedAt: Date };
  /** Set for expense records created from an advance-cash case (single source of truth). */
  sourceType: 'MANUAL' | 'ADVANCE_CASH' | 'PARTNER_WITHDRAWAL' | 'REVERSAL';
  sourceRef?: Types.ObjectId;
  status: 'posted' | 'reversed';
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
  reversesExpense?: Types.ObjectId;
  cashMovement?: Types.ObjectId;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpenseTransaction>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    subCategory: { type: String, maxlength: 120 },
    // Negative values are reversal mirrors of an original record; the service layer
    // rejects negative input for new entries.
    amountPaisa: { type: Number, required: true },
    isOperatingExpense: { type: Boolean, default: true, index: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: 'CASH' },
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', index: true },
    accountName: { type: String },
    transactionDate: { type: Date, required: true, index: true },
    paidTo: { type: String, maxlength: 160 },
    partner: { type: Schema.Types.ObjectId, ref: 'Partner', index: true },
    partnerName: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    tokenNumber: { type: Number, index: true },
    location: { type: String, enum: ['MACH', 'QUETTA'], index: true },
    purpose: { type: String, maxlength: 1000 },
    attachment: {
      type: {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
      default: undefined,
    },
    sourceType: {
      type: String,
      enum: ['MANUAL', 'ADVANCE_CASH', 'PARTNER_WITHDRAWAL', 'REVERSAL'],
      default: 'MANUAL',
      index: true,
    },
    sourceRef: { type: Schema.Types.ObjectId, index: true },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    reversedAt: { type: Date },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String },
    reversesExpense: { type: Schema.Types.ObjectId, ref: 'ExpenseTransaction' },
    cashMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

expenseSchema.index({ transactionDate: -1, category: 1 });
/** One expense mirror per advance-cash case: prevents duplicate cash outflow records. */
expenseSchema.index(
  { sourceType: 1, sourceRef: 1 },
  { unique: true, partialFilterExpression: { sourceType: { $in: ['ADVANCE_CASH', 'PARTNER_WITHDRAWAL'] } }, name: 'uniq_advance_expense' }
);

export const ExpenseTransaction = model<IExpenseTransaction>('ExpenseTransaction', expenseSchema);
