import { Schema, model, Types } from 'mongoose';

/**
 * The three partner accounts (PRD p.12): Irfan, Ghulam Muhammad and Hafiz Khalid.
 * Balances are cached and always recomputed from PartnerTransaction records.
 * Ownership percentage / profit share is deliberately NOT derived from withdrawals.
 */
export interface IPartner {
  _id?: Types.ObjectId;
  partnerCode: string;
  name: string;
  cnic?: string;
  phone?: string;
  isActive: boolean;
  totalWithdrawnPaisa: number;
  totalContributedPaisa: number;
  totalRepaidPaisa: number;
  /** contributions + repayments - withdrawals, in paisa. */
  netCashPaisa: number;
  openingBalancePaisa: number;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
  {
    partnerCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true, trim: true },
    cnic: { type: String },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
    totalWithdrawnPaisa: { type: Number, default: 0 },
    totalContributedPaisa: { type: Number, default: 0 },
    totalRepaidPaisa: { type: Number, default: 0 },
    netCashPaisa: { type: Number, default: 0 },
    openingBalancePaisa: { type: Number, default: 0 },
    notes: { type: String, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Partner = model<IPartner>('Partner', partnerSchema);
