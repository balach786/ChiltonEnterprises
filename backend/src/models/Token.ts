import { Schema, model, Types } from 'mongoose';

/**
 * The 120-slot token register (PRD p.3 "120 token slots, Token 001 through Token 120").
 * A token row is never deleted: previous assignments are retained so a token can be
 * re-used for a new scheme while its history survives (PRD p.7 token lifecycle).
 */
export interface IToken {
  _id?: Types.ObjectId;
  /** 1 - 120 */
  number: number;
  /** Zero padded display form, e.g. "007" */
  code: string;
  status: 'unassigned' | 'assigned';
  currentEnrollment?: Types.ObjectId;
  currentCustomer?: Types.ObjectId;
  /** Chronological record of every enrolment that has ever held this token. */
  history: Array<{
    enrollment: Types.ObjectId;
    customer: Types.ObjectId;
    assignedAt: Date;
    releasedAt?: Date;
  }>;
}

const tokenSchema = new Schema<IToken>(
  {
    number: { type: Number, required: true, unique: true, min: 1, max: 120, index: true },
    code: { type: String, required: true, unique: true },
    status: { type: String, enum: ['unassigned', 'assigned'], default: 'unassigned', index: true },
    currentEnrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment' },
    currentCustomer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    history: {
      type: [
        {
          enrollment: { type: Schema.Types.ObjectId, ref: 'SchemeEnrollment', required: true },
          customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
          assignedAt: { type: Date, default: Date.now },
          releasedAt: { type: Date },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const Token = model<IToken>('Token', tokenSchema);

export function tokenCode(n: number): string {
  return String(n).padStart(3, '0');
}
