/**
 * Money handling.
 *
 * Every monetary value inside the database and inside all business logic is stored as
 * an INTEGER number of minor units (paisa, 1 PKR = 100 paisa). PKR is only ever a
 * presentation concern. This avoids IEEE-754 float rounding errors in financial maths
 * (PRD section 11 "financial integrity").
 */

export const PAISA_PER_PKR = 100;

const isNumeric = (v: unknown): v is number | string =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

/** Convert a PKR amount (number or numeric string) into integer paisa. */
export function toPaisa(pkr: unknown): number {
  if (!isNumeric(pkr)) {
    throw new Error(`Invalid PKR amount: ${String(pkr)}`);
  }
  const value = typeof pkr === 'number' ? pkr : Number(String(pkr).trim());
  // Round to the nearest paisa to absorb decimal noise from JSON input.
  const paisa = Math.round(value * PAISA_PER_PKR);
  if (!Number.isFinite(paisa)) {
    throw new Error(`Invalid PKR amount: ${String(pkr)}`);
  }
  return paisa;
}

/** Convert integer paisa into a PKR number (2 decimal places). */
export function toPkr(paisa: unknown): number {
  const p = Number(paisa ?? 0);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p) / PAISA_PER_PKR;
}

/** Integer paisa -> "12,345.00" style PKR string. */
export function formatPkr(paisa: unknown): string {
  return toPkr(paisa).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sumPaisa(values: Array<number | undefined | null>): number {
  return values.reduce<number>((acc, v) => acc + (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0), 0);
}

/**
 * Split `total` into `count` integer parts that sum EXACTLY to `total`.
 * Remainder paisa are distributed one-by-one to the first parts so the schedule
 * always reconciles with the scheme total.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Add `months` calendar months to a date, clamping the day to the month length. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** Local-timezone start of day (server timezone is the business timezone). */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date.getTime());
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date = new Date()): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date: Date = new Date()): Date {
  const d = endOfDay(date);
  d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return d;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
