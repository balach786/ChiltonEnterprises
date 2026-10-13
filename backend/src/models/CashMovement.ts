import { Schema, model, Types } from 'mongoose';

/**
 * The cash/bank ledger. Every real money movement produces EXACTLY ONE row here.
 *
 * The compound unique index on (sourceType, sourceRef, account, direction) makes it
 * impossible for a single source transaction to create a duplicate cash movement
 * (PRD p.11 "No duplicate entry", p.13 financial integrity).
 */
export interface ICashMovement {
  _id?: Types.ObjectId;
  account: Types.ObjectId;
  accountName: string;
  accountType: 'CASH' | 'BANK';
  direction: 'IN' | 'OUT';
  amountPaisa: number;
  movementDate: Date;
  sourceType:
    | 'CUSTOMER_PAYMENT'
    | 'INCOME'
    | 'EXPENSE'
    | 'PARTNER_TXN'
    | 'ADVANCE_CASH'
    | 'TRANSFER'
    | 'OPENING_BALANCE';
  sourceRef?: Types.ObjectId | string;
  transfer?: Types.ObjectId;
  /** For transfers: the counterpart account. */
  counterpartAccount?: Types.ObjectId;
  description?: string;
  reference?: string;
  customer?: Types.ObjectId;
  partner?: Types.ObjectId;
  status: 'posted' | 'reversed';
  reversedAt?: Date;
  reversalReason?: string;
  reversalOf?: Types.ObjectId;
  enteredBy?: Types.ObjectId;
  enteredByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const movementSchema = new Schema<ICashMovement>(
  {
    account: { type: Schema.Types.ObjectId, ref: 'FinancialAccount', required: true, index: true },
    accountName: { type: String, required: true },
    accountType: { type: String, enum: ['CASH', 'BANK'], required: true, index: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    movementDate: { type: Date, required: true, index: true },
    sourceType: {
      type: String,
      enum: [
        'CUSTOMER_PAYMENT',
        'INCOME',
        'EXPENSE',
        'PARTNER_TXN',
        'ADVANCE_CASH',
        'TRANSFER',
        'OPENING_BALANCE',
      ],
      required: true,
      index: true,
    },
    sourceRef: { type: Schema.Types.ObjectId },
    transfer: { type: Schema.Types.ObjectId, ref: 'Transfer', index: true },
    counterpartAccount: { type: Schema.Types.ObjectId, ref: 'FinancialAccount' },
    description: { type: String, maxlength: 500 },
    reference: { type: String, maxlength: 120, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    partner: { type: Schema.Types.ObjectId, ref: 'Partner', index: true },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', index: true },
    reversedAt: { type: Date },
    reversalReason: { type: String },
    reversalOf: { type: Schema.Types.ObjectId, ref: 'CashMovement' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enteredByName: { type: String },
  },
  { timestamps: true }
);

movementSchema.index({ movementDate: -1, direction: 1 });
movementSchema.index({ account: 1, movementDate: -1 });
movementSchema.index(
  { sourceType: 1, sourceRef: 1, account: 1, direction: 1 },
  { unique: true, name: 'uniq_movement_per_source' }
);

export const CashMovement = model<ICashMovement>('CashMovement', movementSchema);
