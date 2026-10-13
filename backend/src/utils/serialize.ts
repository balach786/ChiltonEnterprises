import { Types } from 'mongoose';
import { formatPkr, toPkr } from './money';

/**
 * Converts any document to a plain JSON object and adds a human readable `*_pkr`
 * sibling for every `*Paisa` field. Internal maths always stays in integer paisa; the
 * PKR mirror exists purely so the UI and exports never do float arithmetic.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeMoney<T = any>(doc: unknown): T {
  if (doc === null || doc === undefined) return doc as T;

  if (Array.isArray(doc)) return doc.map((d) => serializeMoney(d)) as unknown as T;

  if (doc instanceof Types.ObjectId) return doc.toHexString() as unknown as T;

  if (doc instanceof Date) return doc.toISOString() as unknown as T;

  if (typeof doc === 'object') {
    const source = typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : (doc as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (key === '__v') continue;
      out[key] = serializeMoney(value);
      if (key.endsWith('Paisa') && typeof value === 'number') {
        const base = key.slice(0, -'Paisa'.length);
        out[`${base}Pkr`] = toPkr(value);
        out[`${base}Formatted`] = formatPkr(value);
      }
    }
    return out as T;
  }

  return doc as T;
}

/** Amount block used by all list/detail endpoints. */
export function amount(paisa: number) {
  return { paisa, pkr: toPkr(paisa), formatted: formatPkr(paisa) };
}
