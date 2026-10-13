import { ClientSession } from 'mongoose';
import { nextSequence, Settings, SETTINGS_KEY } from '../models';
import { ISettings } from '../models/Settings';

/** Returns the single global settings document, creating it with defaults on first use. */
export async function getSettings(): Promise<ISettings> {
  let doc = await Settings.findOne({}).lean();
  if (!doc) {
    doc = (await Settings.create({})).toObject();
  }
  return doc as ISettings;
}

export async function updateSettings(patch: Partial<ISettings>, updatedBy?: string): Promise<ISettings> {
  const doc = await Settings.findOneAndUpdate(
    {},
    { $set: { ...patch, updatedBy } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc as ISettings;
}

/**
 * Reserve the next receipt number. The counter increment is atomic and the resulting
 * string carries a unique index on Receipt, so numbers can never collide.
 */
export async function nextReceiptNumber(session: ClientSession | null = null): Promise<string> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  const key = `receipt:${year}`;
  const seq = await nextSequence(key);
  const padding = Math.max(3, settings.receiptSeqPadding ?? 6);
  return `${settings.receiptPrefix}-${year}-${String(seq).padStart(padding, '0')}`;
}

export function pad(value: number, size = 6): string {
  return String(value).padStart(size, '0');
}

export { SETTINGS_KEY };
