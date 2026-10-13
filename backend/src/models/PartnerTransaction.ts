import { Schema, model, Types } from 'mongoose';
import { PAYMENT_METHODS } from '../constants';

export interface IPartnerTransaction {
  _id?: Types.ObjectId;
  transactionId: string;
  partner: Types.ObjectId;
  partnerName: string;
  type: 'WITHDRAWAL' | 'CONTRIBUTION' | 'REPAYMENT' | 'CORRECTION';
  amountPaisa: number;
  /** Signed effect on showroom cash: withdrawal = -amount, contribution/repayment = +amount. */
  cashEffectPaisa: number;
  method: (typeof PAYMENT_METHODS)[number];
  account?: Types.ObjectId;
  accountName?: string;
  transactionDate: Date;
  purpose?: string;
  reference?: string;
  status: 'posted' | 'reversed';
  reversedAt?: Date;
  reversalReason?: string;
  reversesTransaction?: Types.ObjectId;
  cashMovement?: Types.ObjectId;
  expenseTransaction?: Types.ObjectId;
  incomeTransaction?: Types.ObjectId;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const partnerTxnSchema = new Schema<IPartnerTransaction>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    partner: { type: Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
    partnerName: { type: String, required: true },
    type: {
      type: String,
      enum: ['WITHDRAWAL', 'CONTRIBUTION', 'REPAYMENT', 'CORRECTION'],
      required: true,
      index: true,
    },
    amountPaisa: { type: Number, required: true, min: 0 },
    cashEffectPaisa: { type: Number, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: 'CASH' },
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', index: true },
    accountName: { type: String },
    transactionDate: { type: Date, required: true, index: true },
    purpose: { type: String, maxlength: 1000 },
    reference: { type: String, maxlength: 120 },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    reversedAt: { type: Date },
    reversalReason: { type: String },
    reversesTransaction: { type: Schema.Types.ObjectId, ref: 'PartnerTransaction' },
    cashMovement: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    expenseTransaction: { type: Schema.Types.ObjectId, ref: 'ExpenseTransaction' },
    incomeTransaction: { type: Schema.Types.ObjectId, ref: 'IncomeTransaction' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

partnerTxnSchema.index({ partner: 1, transactionDate: -1 });

export const PartnerTransaction = model<IPartnerTransaction>('PartnerTransaction', partnerTxnSchema);

/** Signed cash effect of a partner transaction (PRD p.13: withdrawals reduce the balance). */
export function partnerCashEffect(
  type: IPartnerTransaction['type'],
  amountPaisa: number
): number {
  switch (type) {
    case 'WITHDRAWAL':
      return -Math.abs(amountPaisa);
    case 'CONTRIBUTION':
    case 'REPAYMENT':
      return Math.abs(amountPaisa);
    case 'CORRECTION':
    default:
      return 0;
  }
}
