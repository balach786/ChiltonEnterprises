import { addMonths, formatPkr, splitEvenly, toPaisa, toPkr } from '../../utils/money';
import { allocatePayment, buildSchedule, computeTotals, schemeTotalPaisa } from '../../utils/schedule';
import { deriveInstallmentStatus } from '../../models/Installment';
import { SCHEME } from '../../constants';

describe('money helpers', () => {
  it('converts PKR to integer paisa without floating point drift', () => {
    expect(toPaisa(10000)).toBe(1000000);
    expect(toPaisa('1234.56')).toBe(123456);
    // 0.1 + 0.2 style noise must not survive
    expect(toPaisa(19.99 * 3)).toBe(5997);
  });

  it('converts paisa back to PKR', () => {
    expect(toPkr(1000000)).toBe(10000);
    expect(toPkr(1)).toBe(0.01);
    expect(toPkr(undefined)).toBe(0);
  });

  it('formats PKR with two decimals', () => {
    expect(formatPkr(1234567)).toBe('12,345.67');
  });

  it('rejects non numeric amounts', () => {
    expect(() => toPaisa('abc')).toThrow();
    expect(() => toPaisa(null)).toThrow();
  });

  it('splits a total into parts that sum exactly to the total', () => {
    const parts = splitEvenly(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('adds calendar months and clamps the day', () => {
    expect(addMonths(new Date(2024, 0, 31), 1).getDate()).toBe(29); // Feb 2024 has 29 days
    expect(addMonths(new Date(2024, 0, 15), 12).getFullYear()).toBe(2025);
  });
});

describe('installment schedule generation', () => {
  const start = new Date(2024, 0, 15);

  it('generates exactly 28 periods for the standard scheme', () => {
    const schedule = buildSchedule({ startDate: start, monthlyInstallmentPaisa: 1000000, durationMonths: 28 });
    expect(schedule).toHaveLength(SCHEME.INSTALLMENT_MONTHS);
    expect(schedule[0].monthNumber).toBe(1);
    expect(schedule[27].monthNumber).toBe(28);
  });

  it('uses the same fixed monthly amount for every period', () => {
    const schedule = buildSchedule({ startDate: start, monthlyInstallmentPaisa: 1250000, durationMonths: 28 });
    const amounts = new Set(schedule.map((s) => s.scheduledPaisa));
    expect(amounts.size).toBe(1);
    expect(amounts.values().next().value).toBe(1250000);
  });

  it('produces increasing monthly due dates on the joining anniversary', () => {
    const schedule = buildSchedule({ startDate: start, monthlyInstallmentPaisa: 1000000, durationMonths: 28 });
    expect(schedule[0].dueDate.toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(schedule[1].dueDate.toISOString().slice(0, 10)).toBe('2024-02-15');
    expect(schedule[12].dueDate.toISOString().slice(0, 10)).toBe('2025-01-15');
    expect(schedule[27].dueDate.toISOString().slice(0, 10)).toBe('2026-04-15');
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i].dueDate.getTime()).toBeGreaterThan(schedule[i - 1].dueDate.getTime());
    }
  });

  it('honours a fixed due day of month', () => {
    const schedule = buildSchedule({ startDate: start, monthlyInstallmentPaisa: 1000000, durationMonths: 28, dueDayOfMonth: 5 });
    expect(schedule.every((s) => s.dueDate.getDate() === 5)).toBe(true);
  });

  it('rejects an invalid monthly amount', () => {
    expect(() => buildSchedule({ startDate: start, monthlyInstallmentPaisa: 0, durationMonths: 28 })).toThrow();
    expect(() => buildSchedule({ startDate: start, monthlyInstallmentPaisa: -5, durationMonths: 28 })).toThrow();
  });

  it('computes the scheme total as monthly x 28', () => {
    expect(schemeTotalPaisa(1000000, 28)).toBe(28000000);
    expect(schemeTotalPaisa(1250000, 28)).toBe(35000000);
  });
});

describe('payment allocation', () => {
  const targets = [
    { installmentId: 'a', monthNumber: 1, scheduledPaisa: 1000000, paidPaisa: 0, adjustedPaisa: 0, status: 'unpaid' as const },
    { installmentId: 'b', monthNumber: 2, scheduledPaisa: 1000000, paidPaisa: 0, adjustedPaisa: 0, status: 'unpaid' as const },
  ];

  it('allocates a full payment to a single month', () => {
    const res = allocatePayment([targets[0]], 1000000);
    expect(res.allocatedPaisa).toBe(1000000);
    expect(res.unallocatedPaisa).toBe(0);
    expect(res.allocations).toEqual([{ installmentId: 'a', monthNumber: 1, amountPaisa: 1000000 }]);
  });

  it('allocates a partial payment and keeps the rest outstanding', () => {
    const res = allocatePayment([targets[0]], 400000);
    expect(res.allocatedPaisa).toBe(400000);
    expect(res.allocations[0].amountPaisa).toBe(400000);
  });

  it('spreads a multi-month payment across the selected months only', () => {
    const res = allocatePayment(targets, 1500000);
    expect(res.allocations).toEqual([
      { installmentId: 'a', monthNumber: 1, amountPaisa: 1000000 },
      { installmentId: 'b', monthNumber: 2, amountPaisa: 500000 },
    ]);
    expect(res.allocatedPaisa).toBe(1500000);
    expect(res.unallocatedPaisa).toBe(0);
  });

  it('never spills an overpayment into a month that was not selected', () => {
    const res = allocatePayment([targets[0]], 1600000);
    expect(res.allocatedPaisa).toBe(1000000);
    expect(res.unallocatedPaisa).toBe(600000);
  });

  it('refuses to allocate to an installment stopped by a draw closure', () => {
    const stopped = [
      { installmentId: 'a', monthNumber: 16, scheduledPaisa: 1000000, paidPaisa: 0, adjustedPaisa: 0, status: 'not_applicable' as const },
    ];
    const res = allocatePayment(stopped, 1000000);
    expect(res.allocatedPaisa).toBe(0);
    expect(res.unallocatedPaisa).toBe(1000000);
    expect(res.rejected[0].reason).toMatch(/not applicable/);
  });

  it('rejects an already paid installment', () => {
    const paid = [
      { installmentId: 'a', monthNumber: 1, scheduledPaisa: 1000000, paidPaisa: 1000000, adjustedPaisa: 0, status: 'paid' as const },
    ];
    const res = allocatePayment(paid, 500000);
    expect(res.allocatedPaisa).toBe(0);
    expect(res.rejected[0].reason).toMatch(/already fully paid/);
  });

  it('blocks partial payments when the setting is disabled', () => {
    const res = allocatePayment([targets[0]], 400000, { allowPartial: false });
    expect(res.allocatedPaisa).toBe(0);
    expect(res.rejected[0].reason).toMatch(/Partial payments are disabled/);
  });

  it('throws on overpayment when overpayments are disabled', () => {
    expect(() => allocatePayment([targets[0]], 1600000, { allowOverpay: false })).toThrow(/overpayments are disabled/);
  });

  it('allocates in month order regardless of input order', () => {
    const res = allocatePayment([targets[1], targets[0]], 1200000);
    expect(res.allocations.map((a) => a.monthNumber)).toEqual([1, 2]);
  });
});

describe('enrollment totals', () => {
  const base = (over: Partial<Parameters<typeof computeTotals>[0]['installments'][number]> = {}) => ({
    monthNumber: 1,
    scheduledPaisa: 1000000,
    paidPaisa: 0,
    adjustedPaisa: 0,
    status: 'unpaid' as const,
    dueDate: new Date(),
    ...over,
  });

  it('sums paid amounts and outstanding balances', () => {
    const totals = computeTotals({
      installments: [
        base({ monthNumber: 1, paidPaisa: 1000000, status: 'paid' }),
        base({ monthNumber: 2, paidPaisa: 400000, status: 'partial' }),
        base({ monthNumber: 3 }),
      ],
    });
    expect(totals.totalPaidPaisa).toBe(1400000);
    expect(totals.payableTotalPaisa).toBe(3000000);
    expect(totals.outstandingPaisa).toBe(1600000);
  });

  it('excludes installments stopped by a closure from the payable total', () => {
    const installments = Array.from({ length: 28 }, (_, i) =>
      base({
        monthNumber: i + 1,
        paidPaisa: i < 15 ? 1000000 : 0,
        status: i < 15 ? ('paid' as const) : ('not_applicable' as const),
        stoppedAfterDraw: i >= 15,
      })
    );
    const totals = computeTotals({ installments });
    expect(totals.totalPaidPaisa).toBe(15000000);
    expect(totals.payableTotalPaisa).toBe(15000000); // only months 1-15 stay payable
    expect(totals.outstandingPaisa).toBe(0);
    expect(totals.notApplicableCount).toBe(13); // months 16-28
    expect(totals.lastPayableMonth).toBe(15);
  });

  it('never reports a negative outstanding balance', () => {
    const totals = computeTotals({ installments: [base({ paidPaisa: 1500000 })] });
    expect(totals.outstandingPaisa).toBe(0);
  });
});

describe('installment status derivation', () => {
  const past = new Date(Date.now() - 5 * 86400000);
  const future = new Date(Date.now() + 5 * 86400000);

  it('marks an unsettled past-due period as overdue', () => {
    expect(deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 0, adjustedPaisa: 0, dueDate: past })).toBe('overdue');
  });

  it('marks a settled period as paid', () => {
    expect(deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 1000, adjustedPaisa: 0, dueDate: past })).toBe('paid');
  });

  it('marks a part-paid period as partial', () => {
    expect(deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 400, adjustedPaisa: 0, dueDate: future })).toBe('partial');
  });

  it('marks a waived period as adjusted', () => {
    expect(deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 0, adjustedPaisa: 1000, dueDate: past })).toBe('adjusted');
  });

  it('marks a future unpaid period as unpaid', () => {
    expect(deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 0, adjustedPaisa: 0, dueDate: future })).toBe('unpaid');
  });

  it('always returns not_applicable for a period stopped by a draw', () => {
    expect(
      deriveInstallmentStatus({ scheduledPaisa: 1000, paidPaisa: 0, adjustedPaisa: 0, dueDate: past, stoppedAfterDraw: true })
    ).toBe('not_applicable');
  });
});
