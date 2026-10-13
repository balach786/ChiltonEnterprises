import { Schema, model, Types } from 'mongoose';
import { SCHEME } from '../constants';

export interface ISettings {
  _id?: Types.ObjectId;
  businessName: string;
  reportHeader: string;
  /** Configurable current scheme month, 1-28 (PRD p.14 dashboard cards). */
  currentSchemeMonth: number;
  allowPartialPayments: boolean;
  allowMultipleMonthPayments: boolean;
  /** 'block' rejects duplicate CNIC, 'warn' returns a warning flag, 'allow' permits it. */
  duplicateCnicPolicy: 'block' | 'warn' | 'allow';
  /** Draw confirmation immediately closes the account, or requires a separate closure step. */
  autoCloseOnDraw: boolean;
  /** Receipt number format: {PREFIX}-{YEAR}-{SEQ} where SEQ is zero padded. */
  receiptPrefix: string;
  receiptSeqPadding: number;
  installmentDueDayOfMonth: number | null;
  defaultSchemeDurationMonths: number;
  cnicMaskingEnabled: boolean;
  locations: string[];
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethods: string[];
  timezone: string;
  updatedBy?: string;
}

const settingsSchema = new Schema<ISettings>(
  {
    businessName: { type: String, default: 'Chilton Enterprises' },
    reportHeader: { type: String, default: 'Chilton Enterprises - Showroom Management System' },
    currentSchemeMonth: { type: Number, min: 1, max: SCHEME.INSTALLMENT_MONTHS, default: 1 },
    allowPartialPayments: { type: Boolean, default: true },
    allowMultipleMonthPayments: { type: Boolean, default: true },
    duplicateCnicPolicy: { type: String, enum: ['block', 'warn', 'allow'], default: 'block' },
    autoCloseOnDraw: { type: Boolean, default: true },
    receiptPrefix: { type: String, default: 'RCPT' },
    receiptSeqPadding: { type: Number, default: 6, min: 3, max: 10 },
    installmentDueDayOfMonth: { type: Number, min: 1, max: 28, default: null },
    defaultSchemeDurationMonths: {
      type: Number,
      default: SCHEME.INSTALLMENT_MONTHS,
      min: SCHEME.INSTALLMENT_MONTHS,
    },
    cnicMaskingEnabled: { type: Boolean, default: true },
    locations: { type: [String], default: [...SCHEME.LOCATIONS] },
    incomeCategories: {
      type: [String],
      default: [
        'CUSTOMER_INSTALLMENT',
        'CUSTOMER_OTHER',
        'BUSINESS_REVENUE',
        'PARTNER_CONTRIBUTION',
        'LOAN_OR_FUNDING',
        'OTHER',
      ],
    },
    expenseCategories: {
      type: [String],
      default: [
        'UTILITY_BILLS',
        'CUSTOMER_ADVANCE_CASH',
        'DAILY_FOOD',
        'MAINTENANCE',
        'TRAVELING',
        'PARTNER_WITHDRAWAL',
        'OTHER',
      ],
    },
    paymentMethods: { type: [String], default: ['CASH', 'BANK', 'CHEQUE', 'ONLINE', 'OTHER'] },
    timezone: { type: String, default: 'Asia/Karachi' },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

/** Single document collection - always fetched by this fixed key. */
export const SETTINGS_KEY = 'global';

export const Settings = model<ISettings>('Settings', settingsSchema);
