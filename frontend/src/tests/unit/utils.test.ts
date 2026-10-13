import { describe, expect, it } from 'vitest';
import {
  cn,
  filenameFromDisposition,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPkr,
  monthStartIso,
  pkrFromPaisa,
  pkrToPaisa,
  titleCase,
  todayIso,
  truncate,
} from '@/lib/utils';

describe('paisa <-> PKR conversion', () => {
  it('converts integer paisa to PKR without float drift', () => {
    expect(pkrFromPaisa(125050)).toBe(1250.5);
    expect(pkrFromPaisa(0)).toBe(0);
    expect(pkrFromPaisa(null)).toBe(0);
    expect(pkrFromPaisa(undefined)).toBe(0);
  });

  it('converts user input into integer paisa, never a float', () => {
    expect(pkrToPaisa('5000')).toBe(500000);
    expect(pkrToPaisa('5000.5')).toBe(500050);
    expect(pkrToPaisa('5000.05')).toBe(500005);
    expect(pkrToPaisa(4999.99)).toBe(499999);
    expect(pkrToPaisa('PKR 1,250.75')).toBe(125075);
    expect(pkrToPaisa('')).toBe(0);
    expect(pkrToPaisa('-250')).toBe(-25000);
    expect(Number.isInteger(pkrToPaisa('0.1'))).toBe(true);
  });

  it('round-trips the installment amounts the scheme uses', () => {
    for (const pkr of [3000, 4500, 5000, 7250.5, 12000]) {
      expect(pkrFromPaisa(pkrToPaisa(pkr))).toBeCloseTo(pkr, 2);
    }
  });

  it('keeps a 28-month schedule exact when the total is split into paisa', () => {
    const totalPaisa = pkrToPaisa('140000'); // 5,000 x 28
    expect(totalPaisa).toBe(14000000);
    expect(totalPaisa / 28).toBe(500000);
  });
});

describe('formatting', () => {
  it('formats PKR with two decimals and thousands separators', () => {
    // The label is written by hand so Node and every browser render the same string.
    expect(formatPkr(20050000)).toBe('PKR 200,500.00');
    expect(formatPkr(0)).toBe('PKR 0.00');
    expect(formatPkr(null)).toBe('PKR 0.00');
    expect(formatPkr(-2500000)).toBe('PKR -25,000.00');
  });

  it('formats counts', () => {
    expect(formatNumber(120)).toBe('120');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(null)).toBe('0');
  });

  it('formats dates in the business locale and degrades safely', () => {
    expect(formatDate('2026-10-01T00:00:00.000Z')).toMatch(/2026/);
    expect(formatDate(null)).toBe('-');
    expect(formatDate('not-a-date')).toBe('-');
    expect(formatDateTime('2026-10-01T09:30:00.000Z')).toMatch(/2026/);
    expect(formatDateTime(undefined)).toBe('-');
  });

  it('title-cases statuses and enum values', () => {
    expect(titleCase('not_applicable')).toBe('Not Applicable');
    expect(titleCase('drawn_closed')).toBe('Drawn Closed');
    expect(titleCase('CASH')).toBe('Cash');
    expect(titleCase(null)).toBe('-');
  });

  it('truncates long text', () => {
    expect(truncate('abcdef', 3)).toBe('ab…');
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate(null)).toBe('-');
  });

  it('merges tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    const hidden = false;
    expect(cn('text-sm', undefined, hidden && 'hidden', 'text-red-500')).toBe('text-sm text-red-500');
  });
});

describe('date helpers', () => {
  it('produces ISO date strings', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(monthStartIso()).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('download filename parsing', () => {
  it('reads a filename out of a content-disposition header', () => {
    expect(filenameFromDisposition('attachment; filename="customers.xlsx"')).toBe('customers.xlsx');
    expect(filenameFromDisposition("attachment; filename=customers.csv")).toBe('customers.csv');
    expect(filenameFromDisposition(undefined)).toBeNull();
  });
});
