import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The whole system stores money as integer paisa. Convert only at the display edge. */
export function pkrFromPaisa(paisa: number | null | undefined): number {
  return (Number(paisa ?? 0) || 0) / 100;
}

/** Convert user-entered PKR into the integer paisa the API expects (no float drift). */
export function pkrToPaisa(pkr: number | string): number {
  const raw = String(pkr ?? '').trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace(/[^0-9.]/g, '').split('.');
  const paisa = Number(whole || '0') * 100 + Number((fraction + '00').slice(0, 2));
  return (negative ? -1 : 1) * paisa;
}

/**
 * Money is always shown as "PKR 12,345.00". The symbol is written by hand on purpose:
 * Intl's currency style renders "Rs" for en-PK in some ICU builds and "PKR" in others,
 * and the API, Excel, CSV and PDF exports all label amounts PKR (PRD section 2).
 */
const PKR_AMOUNT_FORMAT = new Intl.NumberFormat('en-PK', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const NUMBER_FORMAT = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });

export function formatPkr(paisa: number | null | undefined): string {
  return `PKR ${PKR_AMOUNT_FORMAT.format(pkrFromPaisa(paisa))}`;
}

export function formatNumber(value: number | null | undefined): string {
  return NUMBER_FORMAT.format(Number(value ?? 0));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

export function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthStartIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function truncate(value: string | null | undefined, length = 60): string {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function filenameFromDisposition(header?: string): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}
