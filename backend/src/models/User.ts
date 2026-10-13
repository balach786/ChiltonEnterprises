import { Schema, model, Types } from 'mongoose';
import { ALL_ROLES, Role } from '../constants';

export interface IUser {
  _id?: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  /** Extra permissions granted on top of the role (e.g. draw confirmation for a draw manager). */
  extraPermissions: string[];
  /** Permissions removed from the role defaults. */
  deniedPermissions: string[];
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ALL_ROLES, required: true, default: 'viewer', index: true },
    isActive: { type: Boolean, default: true, index: true },
    extraPermissions: { type: [String], default: [] },
    deniedPermissions: { type: [String], default: [] },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = model<IUser>('User', userSchema);
