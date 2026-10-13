import { ClientSession } from 'mongoose';
import { Request } from 'express';
import { AuditAction, AuditLog } from '../models';
import { AuthUser } from '../types/express';

export interface AuditInput {
  actor?: AuthUser | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  request?: Request;
}

/**
 * Append-only audit trail (PRD section 14). Records are never updated or deleted, so the
 * history of a correction is always recoverable.
 */
export async function writeAudit(
  input: AuditInput,
  session: ClientSession | null = null
): Promise<void> {
  const doc = new AuditLog({
    actor: input.actor?.id,
    actorName: input.actor?.name ?? 'system',
    actorRole: input.actor?.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    description: input.description,
    previousValue: input.previousValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: input.request?.ip,
    userAgent: input.request?.headers?.['user-agent'],
  });
  if (session) await doc.save({ session });
  else await doc.save();
}

/** Same as writeAudit but never throws - used where an audit failure must not roll back. */
export async function safeAudit(input: AuditInput): Promise<void> {
  try {
    await writeAudit(input);
  } catch {
    /* audit must never break the business operation */
  }
}
