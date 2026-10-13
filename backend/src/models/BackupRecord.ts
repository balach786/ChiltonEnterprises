import { Schema, model, Types } from 'mongoose';

/**
 * Backup / migration / archive records (PRD p.16). Each authorised export or restore
 * leaves an audit-visible record of what was taken and by whom.
 */
export interface IBackupRecord {
  _id?: Types.ObjectId;
  kind: 'EXPORT' | 'RESTORE' | 'SCHEDULED' | 'MIGRATION';
  label: string;
  format: 'json' | 'xlsx' | 'csv' | 'mongodump';
  location: string;
  sizeBytes: number;
  collectionCounts: Record<string, number>;
  checksum?: string;
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  error?: string;
  performedBy?: Types.ObjectId;
  performedByName?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const backupSchema = new Schema<IBackupRecord>(
  {
    kind: { type: String, enum: ['EXPORT', 'RESTORE', 'SCHEDULED', 'MIGRATION'], required: true, index: true },
    label: { type: String, required: true },
    format: { type: String, enum: ['json', 'xlsx', 'csv', 'mongodump'], required: true },
    location: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    collectionCounts: { type: Schema.Types.Mixed, default: {} },
    checksum: { type: String },
    status: { type: String, enum: ['COMPLETED', 'FAILED', 'IN_PROGRESS'], default: 'IN_PROGRESS', index: true },
    error: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true }
);

export const BackupRecord = model<IBackupRecord>('BackupRecord', backupSchema);
