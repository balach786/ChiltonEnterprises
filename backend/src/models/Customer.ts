import { Schema, model, Types } from 'mongoose';
import { CUSTOMER_STATUS, SCHEME } from '../constants';

/**
 * Customer identity. Status, draw status, advance flags and payment status are stored
 * separately so every automatic list can be derived from real fields (PRD p.14).
 */
export interface ICustomer {
  _id?: Types.ObjectId;
  customerCode: string;
  name: string;
  /** Normalised CNIC (digits only, 13 chars). Unique per the configured duplicate policy. */
  cnic: string;
  /** CNIC exactly as entered, kept for printing. */
  cnicFormatted: string;
  phone: string;
  location: 'MACH' | 'QUETTA';
  joiningDate: Date;
  fatherName?: string;
  address?: string;
  status: 'active' | 'drawn_closed' | 'inactive';
  drawStatus: 'NONE' | 'PENDING' | 'CONFIRMED';
  advanceBikeActive: boolean;
  advanceCashActive: boolean;
  currentEnrollment?: Types.ObjectId;
  /** Sum of every valid, non-reversed payment across all enrolments (paisa). */
  lifetimePaidPaisa: number;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    customerCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    cnic: { type: String, required: true, trim: true, index: true },
    cnicFormatted: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    location: { type: String, enum: SCHEME.LOCATIONS, required: true, index: true },
    joiningDate: { type: Date, required: true, index: true },
    fatherName: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(CUSTOMER_STATUS),
      default: CUSTOMER_STATUS.ACTIVE,
      index: true,
    },
    drawStatus: { type: String, enum: ['NONE', 'PENDING', 'CONFIRMED'], default: 'NONE', index: true },
    advanceBikeActive: { type: Boolean, default: false, index: true },
    advanceCashActive: { type: Boolean, default: false, index: true },
    currentEnrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', index: true },
    lifetimePaidPaisa: { type: Number, default: 0, min: 0 },
    notes: { type: String, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/**
 * Duplicate CNIC handling is administrator configurable (block | warn | allow), so the
 * database carries a NON-unique index and the service layer enforces the policy. The
 * policy is checked inside a transaction so concurrent creates cannot both slip through.
 */
customerSchema.index({ name: 'text', cnic: 'text', phone: 'text', customerCode: 'text' });
customerSchema.index({ status: 1, location: 1 });

export const Customer = model<ICustomer>('Customer', customerSchema);

export function normalizeCnic(raw: string): string {
  return String(raw ?? '').replace(/\D+/g, '');
}

export function formatCnic(digits: string): string {
  const d = normalizeCnic(digits);
  if (d.length !== 13) return d;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Masks a CNIC for users without the `cnic:view` permission (PRD security section). */
export function maskCnic(value: string | undefined): string {
  if (!value) return '';
  const digits = normalizeCnic(value);
  if (digits.length < 8) return '*****';
  return `${digits.slice(0, 2)}*******${digits.slice(-3)}`;
}
