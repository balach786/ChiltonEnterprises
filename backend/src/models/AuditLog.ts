import { Schema, model, Types } from 'mongoose';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'PERMISSION_CHANGE'
  | 'REVERSAL'
  | 'ADJUSTMENT'
  | 'APPROVE'
  | 'CONFIRM'
  | 'CORRECTION'
  | 'CLOSURE'
  | 'RECONCILE'
  | 'EXPORT'
  | 'IMPORT'
  | 'RESTORE';

export interface IAuditLog {
  _id?: Types.ObjectId;
  actor?: Types.ObjectId;
  actorName?: string;
  actorRole?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    description: { type: String },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    reason: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
