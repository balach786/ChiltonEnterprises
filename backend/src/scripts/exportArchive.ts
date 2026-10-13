/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { BackupRecord } from '../models';

/**
 * Command-line archive export. Mirrors the API endpoint so a scheduled job (cron /
 * Atlas scheduled backup) has a script to call.
 *
 *   npm run archive:export -- [outputDirectory]
 */
async function main() {
  const outDir = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'uploads', 'backups'));
  fs.mkdirSync(outDir, { recursive: true });

  await connectMongo();
  const db = mongoose.connection.db!;
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
    database: mongoose.connection.name,
    counts,
    collections: archive,
  };
  const json = JSON.stringify(payload);
  const file = path.join(outDir, `showroom-archive-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, json, 'utf8');
  const checksum = crypto.createHash('sha256').update(json).digest('hex');

  await BackupRecord.create({
    kind: 'SCHEDULED',
    label: `CLI archive ${new Date().toISOString()}`,
    format: 'json',
    location: file,
    sizeBytes: Buffer.byteLength(json),
    collectionCounts: counts,
    checksum,
    status: 'COMPLETED',
    performedByName: 'archive:export script',
  });

  console.log(`Archive written to ${file}`);
  console.log(`Size: ${Buffer.byteLength(json)} bytes | SHA-256: ${checksum}`);
  console.log(`Collections: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('Archive failed:', err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
