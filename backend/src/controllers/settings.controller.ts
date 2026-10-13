import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { actor } from '../middleware/auth';
import { BackupRecord, SETTINGS_KEY, Settings } from '../models';
import { getSettings, updateSettings } from '../services/settings.service';
import { writeAudit } from '../services/audit.service';
import { asyncHandler, ok } from '../utils/http';
import { ApiError } from '../utils/ApiError';
import { ensureTokenRegister } from '../services/token.service';
import { SCHEME } from '../constants';

export const getSettingsController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await getSettings());
});

export const updateSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const before = await getSettings();
  const { reason, ...patch } = req.body;
  const updated = await updateSettings(patch, actor(req).name);

  await writeAudit({
    actor: req.user,
    action: 'UPDATE',
    entityType: 'Settings',
    entityId: SETTINGS_KEY,
    description: `Updated system settings: ${Object.keys(patch).join(', ')}`,
    previousValue: before,
    newValue: patch,
    reason: reason ?? 'Configuration change',
    request: req,
  });

  ok(res, updated, 200, 'Settings updated');
});

/** Re-creates any missing token slots (001-120). Safe to call repeatedly. */
export const initTokensController = asyncHandler(async (req: Request, res: Response) => {
  const total = await ensureTokenRegister();
  await writeAudit({
    actor: req.user,
    action: 'IMPORT',
    entityType: 'Token',
    description: `Token register checked - ${total} slots present`,
    reason: 'Token register maintenance',
    request: req,
  });
  ok(res, { total }, 200, `Token register has ${total} slots`);
});

/**
 * Authorised archive export (PRD p.16). Writes a full JSON snapshot of every collection
 * and records the backup so the recovery point is documented.
 */
export const exportArchiveController = asyncHandler(async (req: Request, res: Response) => {
  const db = mongoose.connection.db;
  if (!db) throw ApiError.internal('Database is not connected');

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const archive: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const name of collections) {
    if (name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}).toArray();
    archive[name] = docs;
    counts[name] = docs.length;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: actor(req).name,
    database: mongoose.connection.name,
    counts,
    collections: archive,
  };
  const json = JSON.stringify(payload, (_k, v) =>
    v && typeof v === 'object' && v._bsontype === 'ObjectID' ? String(v) : v
  );

  const dir = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `showroom-archive-${Date.now()}.json`);
  fs.writeFileSync(file, json, 'utf8');

  const checksum = crypto.createHash('sha256').update(json).digest('hex');
  const record = await BackupRecord.create({
    kind: 'EXPORT',
    label: `Full archive ${new Date().toISOString()}`,
    format: 'json',
    location: file,
    sizeBytes: Buffer.byteLength(json),
    collectionCounts: counts,
    checksum,
    status: 'COMPLETED',
    performedBy: actor(req).id,
    performedByName: actor(req).name,
  });

  await writeAudit({
    actor: req.user,
    action: 'EXPORT',
    entityType: 'BackupRecord',
    entityId: String(record._id),
    description: `Created full database archive (${Buffer.byteLength(json)} bytes, ${collections.length} collections)`,
    newValue: { file, checksum, counts },
    reason: 'Authorised archive export',
    request: req,
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
  res.send(json);
});

export const listBackupsController = asyncHandler(async (_req: Request, res: Response) => {
  const items = await BackupRecord.find({}).sort({ createdAt: -1 }).limit(200).lean();
  ok(res, items);
});

export const healthController = asyncHandler(async (_req: Request, res: Response) => {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;
  if (!connected) {
    res.status(503).json({ status: 'degraded', database: 'disconnected' });
    return;
  }
  const collections = (await mongoose.connection.db!.listCollections().toArray()).length;
  ok(res, {
    status: 'ok',
    service: 'showroom-api',
    environment: process.env.NODE_ENV ?? 'development',
    database: { state: 'connected', collections, expectedTokenSlots: SCHEME.TOTAL_TOKEN_SLOTS },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export const settingsMetaController = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await Settings.findOne({}).lean();
  ok(res, {
    settings: settings ?? null,
    tokenSlots: SCHEME.TOTAL_TOKEN_SLOTS,
    installmentMonths: SCHEME.INSTALLMENT_MONTHS,
    locations: SCHEME.LOCATIONS,
    currency: SCHEME.CURRENCY,
  });
});
