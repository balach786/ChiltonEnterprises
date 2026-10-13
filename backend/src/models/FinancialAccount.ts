import { Schema, model, Types } from 'mongoose';

/**
 * Cash and bank account definitions.
 * Closing balance = opening balance + recorded inflows - recorded outflows (PRD p.13).
 * `balancePaisa` is a cache maintained by CashMovement writes and is reconcilable at any
 * time from the movement ledger.
 */
export interface IFinancialAccount {
  _id?: Types.ObjectId;
  code: string;
  name: string;
  type: 'CASH' | 'BANK';
  bankName?: string;
  accountNumber?: string;
  openingBalancePaisa: number;
  /** openingBalance + inflows - outflows, in paisa */
  balancePaisa: number;
  isActive: boolean;
  isDefault: boolean;
  location?: 'MACH' | 'QUETTA' | 'ALL';
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<IFinancialAccount>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['CASH', 'BANK'], required: true, index: true },
    bankName: { type: String, maxlength: 160 },
    accountNumber: { type: String, maxlength: 60 },
    openingBalancePaisa: { type: Number, default: 0 },
    balancePaisa: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    location: { type: String, enum: ['MACH', 'QUETTA', 'ALL'], default: 'ALL' },
    notes: { type: String, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/** Only one default account per type. */
accountSchema.index(
  { type: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'uniq_default_account' }
);

export const FinancialAccount = model<IFinancialAccount>('FinancialAccount', accountSchema);
