import { Types } from 'mongoose';
import {
  CashMovement,
  Customer,
  CustomerAdvance,
  DrawEvent,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  Installment,
  PartnerTransaction,
  Payment,
  SchemeEnrollment,
  Token,
} from '../models';
import { SCHEME } from '../constants';
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from '../utils/money';
import { getSettings } from './settings.service';
import { amount } from '../utils/serialize';

interface SumAgg {
  total?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function sumCollection(model: any, pipeline: any[]): Promise<number> {
  const rows = (await model.aggregate(pipeline).exec()) as SumAgg[];
  return rows[0]?.total ?? 0;
}

function rangeFilter(field: string, from?: Date, to?: Date) {
  const value: Record<string, Date> = {};
  if (from) value.$gte = from;
  if (to) value.$lte = to;
  return Object.keys(value).length ? { [field]: value } : {};
}

export interface DashboardQuery {
  dateFrom?: Date;
  dateTo?: Date;
  location?: 'MACH' | 'QUETTA';
}

/**
 * Every number here is aggregated from MongoDB. No value is estimated, cached in the
 * frontend or hard coded (PRD p.14 "All calculations must come from actual records").
 */
export async function getDashboardSummary(query: DashboardQuery = {}) {
  const settings = await getSettings();
  const now = new Date();
  const todayFrom = startOfDay(now);
  const todayTo = endOfDay(now);
  const monthFrom = startOfMonth(now);
  const monthTo = endOfMonth(now);
  const rangeFrom = query.dateFrom ?? monthFrom;
  const rangeTo = query.dateTo ?? monthTo;

  const locationMatch = query.location ? { location: query.location } : {};

  const [
    totalTokens,
    assignedTokens,
    activeCustomers,
    drawnCustomers,
    advanceBike,
    advanceCash,
    collectionsToday,
    collectionsMonth,
    collectionsRange,
    operatingExpensesToday,
    operatingExpensesMonth,
    operatingExpensesRange,
    advanceCashOutToday,
    advanceCashOutMonth,
    partnerWithdrawalsToday,
    partnerWithdrawalsMonth,
    partnerContributionsMonth,
    inflowRange,
    outflowRange,
    overdueCount,
    partialCount,
    accounts,
    draws,
  ] = await Promise.all([
    Token.countDocuments({}),
    Token.countDocuments({ status: 'assigned' }),
    Customer.countDocuments({ status: 'active', ...locationMatch }),
    Customer.countDocuments({ status: 'drawn_closed', ...locationMatch }),
    CustomerAdvance.countDocuments({ type: 'BIKE', status: 'ACTIVE' }),
    CustomerAdvance.countDocuments({ type: 'CASH', status: 'ACTIVE' }),
    sumCollection(Payment, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, ...rangeFilter('paymentDate', todayFrom, todayTo), ...locationMatch } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(Payment, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, ...rangeFilter('paymentDate', monthFrom, monthTo), ...locationMatch } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(Payment, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, ...rangeFilter('paymentDate', rangeFrom, rangeTo), ...locationMatch } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(ExpenseTransaction, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, isOperatingExpense: true, ...rangeFilter('transactionDate', todayFrom, todayTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(ExpenseTransaction, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, isOperatingExpense: true, ...rangeFilter('transactionDate', monthFrom, monthTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(ExpenseTransaction, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, isOperatingExpense: true, ...rangeFilter('transactionDate', rangeFrom, rangeTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(ExpenseTransaction, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, category: 'CUSTOMER_ADVANCE_CASH', ...rangeFilter('transactionDate', todayFrom, todayTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(ExpenseTransaction, [
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, category: 'CUSTOMER_ADVANCE_CASH', ...rangeFilter('transactionDate', monthFrom, monthTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(PartnerTransaction, [
      { $match: { status: 'posted', type: 'WITHDRAWAL', ...rangeFilter('transactionDate', todayFrom, todayTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(PartnerTransaction, [
      { $match: { status: 'posted', type: 'WITHDRAWAL', ...rangeFilter('transactionDate', monthFrom, monthTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(PartnerTransaction, [
      { $match: { status: 'posted', type: 'CONTRIBUTION', ...rangeFilter('transactionDate', monthFrom, monthTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(CashMovement, [
      { $match: { status: 'posted', direction: 'IN', ...rangeFilter('movementDate', rangeFrom, rangeTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    sumCollection(CashMovement, [
      { $match: { status: 'posted', direction: 'OUT', ...rangeFilter('movementDate', rangeFrom, rangeTo) } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    Installment.countDocuments({ status: 'overdue' }),
    Installment.countDocuments({ status: 'partial' }),
    FinancialAccount.find({ isActive: true }).lean(),
    DrawEvent.countDocuments({ status: { $in: ['CONFIRMED', 'CORRECTED'] } }),
  ]);

  const cashBalance = accounts.filter((a) => a.type === 'CASH').reduce((s, a) => s + a.balancePaisa, 0);
  const bankBalance = accounts.filter((a) => a.type === 'BANK').reduce((s, a) => s + a.balancePaisa, 0);

  const [recentPayments, recentExpenses, recentPartner] = await Promise.all([
    Payment.find({ status: 'posted' }).sort({ createdAt: -1 }).limit(8).populate('customer', 'name location').lean(),
    ExpenseTransaction.find({ status: 'posted' }).sort({ createdAt: -1 }).limit(8).lean(),
    PartnerTransaction.find({ status: 'posted' }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const recentTransactions = [
    ...recentPayments.map((p) => ({
      kind: 'payment' as const,
      id: String(p._id),
      date: p.paymentDate,
      label: `Collection - ${(p.customer as unknown as { name?: string })?.name ?? `token ${p.tokenNumber}`} (${p.paymentNumber})`,
      direction: 'IN' as const,
      amountPaisa: p.amountPaisa,
      accountName: p.accountName,
    })),
    ...recentExpenses.map((e) => ({
      kind: 'expense' as const,
      id: String(e._id),
      date: e.transactionDate,
      label: `Expense - ${e.category}${e.paidTo ? ` (${e.paidTo})` : ''}`,
      direction: 'OUT' as const,
      amountPaisa: e.amountPaisa,
      accountName: e.accountName,
    })),
    ...recentPartner.map((t) => ({
      kind: 'partner' as const,
      id: String(t._id),
      date: t.transactionDate,
      label: `Partner ${t.type.toLowerCase()} - ${t.partnerName}`,
      direction: t.cashEffectPaisa >= 0 ? ('IN' as const) : ('OUT' as const),
      amountPaisa: t.amountPaisa,
      accountName: t.accountName,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15);

  const alerts = await buildAlerts();

  return {
    generatedAt: new Date().toISOString(),
    range: { from: rangeFrom, to: rangeTo },
    tokens: {
      total: SCHEME.TOTAL_TOKEN_SLOTS,
      registered: totalTokens,
      assigned: assignedTokens,
      unassigned: Math.max(0, totalTokens - assignedTokens),
    },
    scheme: { currentSchemeMonth: settings.currentSchemeMonth, durationMonths: SCHEME.INSTALLMENT_MONTHS },
    customers: { active: activeCustomers, drawnClosed: drawnCustomers },
    advances: { bikeCases: advanceBike, cashCases: advanceCash },
    draws: { confirmed: draws },
    collections: {
      today: amount(collectionsToday),
      thisMonth: amount(collectionsMonth),
      range: amount(collectionsRange),
    },
    operatingExpenses: {
      today: amount(operatingExpensesToday),
      thisMonth: amount(operatingExpensesMonth),
      range: amount(operatingExpensesRange),
    },
    customerAdvances: { today: amount(advanceCashOutToday), thisMonth: amount(advanceCashOutMonth) },
    partnerWithdrawals: { today: amount(partnerWithdrawalsToday), thisMonth: amount(partnerWithdrawalsMonth) },
    partnerContributions: { thisMonth: amount(partnerContributionsMonth) },
    cashFlow: {
      totalInflow: amount(inflowRange),
      totalOutflow: amount(outflowRange),
      net: amount(inflowRange - outflowRange),
    },
    balances: {
      cash: amount(cashBalance),
      bank: amount(bankBalance),
      combined: amount(cashBalance + bankBalance),
      accounts: accounts.map((a) => ({
        id: String(a._id),
        name: a.name,
        type: a.type,
        balancePaisa: a.balancePaisa,
        openingBalancePaisa: a.openingBalancePaisa,
      })),
    },
    installments: { overdue: overdueCount, partial: partialCount },
    recentTransactions,
    alerts,
  };
}

/** Data-quality warnings surfaced on the dashboard (PRD p.14). */
export async function buildAlerts() {
  const alerts: Array<{ level: 'warning' | 'info' | 'error'; message: string; count?: number }> = [];
  const settings = await getSettings();

  const totalTokens = await Token.countDocuments({});
  if (totalTokens < SCHEME.TOTAL_TOKEN_SLOTS) {
    alerts.push({
      level: 'error',
      message: `Token register has ${totalTokens} slots - expected ${SCHEME.TOTAL_TOKEN_SLOTS}. Run the token initialisation.`,
      count: totalTokens,
    });
  }

  const customersWithoutEnrollment = await Customer.countDocuments({
    status: 'active',
    currentEnrollment: { $in: [null, undefined] },
  });
  if (customersWithoutEnrollment > 0) {
    alerts.push({
      level: 'warning',
      message: `${customersWithoutEnrollment} active customer(s) have no scheme enrollment.`,
      count: customersWithoutEnrollment,
    });
  }

  const wrongScheduleCount = await SchemeEnrollment.countDocuments({
    durationMonths: { $ne: SCHEME.INSTALLMENT_MONTHS },
    status: 'active',
  });
  if (wrongScheduleCount > 0) {
    alerts.push({
      level: 'error',
      message: `${wrongScheduleCount} active enrollment(s) do not have a ${SCHEME.INSTALLMENT_MONTHS}-month schedule.`,
      count: wrongScheduleCount,
    });
  }

  const incompleteSchedules = await SchemeEnrollment.aggregate([
    { $match: { status: 'active' } },
    { $lookup: { from: 'installments', localField: '_id', foreignField: 'enrollment', as: 'i' } },
    { $addFields: { count: { $size: '$i' } } },
    { $match: { count: { $ne: SCHEME.INSTALLMENT_MONTHS } } },
    { $count: 'total' },
  ]);
  if ((incompleteSchedules[0]?.total ?? 0) > 0) {
    alerts.push({
      level: 'error',
      message: `${incompleteSchedules[0].total} enrollment(s) do not have exactly ${SCHEME.INSTALLMENT_MONTHS} installment records.`,
      count: incompleteSchedules[0].total,
    });
  }

  const overdue = await Installment.countDocuments({ status: 'overdue' });
  if (overdue > 0) alerts.push({ level: 'warning', message: `${overdue} installment(s) are overdue.`, count: overdue });

  const partial = await Installment.countDocuments({ status: 'partial' });
  if (partial > 0) alerts.push({ level: 'info', message: `${partial} installment(s) are partially paid.`, count: partial });

  const unallocated = await Payment.aggregate([
    { $match: { status: 'posted', unallocatedPaisa: { $gt: 0 } } },
    { $count: 'total' },
  ]);
  if ((unallocated[0]?.total ?? 0) > 0) {
    alerts.push({
      level: 'info',
      message: `${unallocated[0].total} payment(s) hold unallocated customer credit.`,
      count: unallocated[0].total,
    });
  }

  const drawnWithoutClosure = await Customer.countDocuments({
    drawStatus: 'CONFIRMED',
    status: { $ne: 'drawn_closed' },
  });
  if (drawnWithoutClosure > 0) {
    alerts.push({
      level: 'error',
      message: `${drawnWithoutClosure} customer(s) are marked drawn but not closed - review the closure records.`,
      count: drawnWithoutClosure,
    });
  }

  const movementsWithoutSource = await CashMovement.countDocuments({
    status: 'posted',
    sourceRef: { $in: [null, undefined] },
    sourceType: { $ne: 'OPENING_BALANCE' },
  });
  if (movementsWithoutSource > 0) {
    alerts.push({
      level: 'warning',
      message: `${movementsWithoutSource} cash movement(s) are not linked to a source transaction.`,
      count: movementsWithoutSource,
    });
  }

  alerts.push({
    level: 'info',
    message: `Current scheme month is ${settings.currentSchemeMonth} of ${SCHEME.INSTALLMENT_MONTHS}.`,
  });

  return alerts;
}

/** Monthly collections series for the dashboard chart. */
export async function getCollectionsSeries(months = 12, location?: 'MACH' | 'QUETTA') {
  const from = new Date();
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const match: Record<string, unknown> = {
    status: 'posted',
    amountPaisa: { $gt: 0 },
    paymentDate: { $gte: from },
  };
  if (location) match.location = location;

  const rows = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } },
        total: { $sum: '$amountPaisa' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const out: Array<{ label: string; totalPaisa: number; count: number }> = [];
  const cursor = new Date(from);
  for (let i = 0; i < months; i += 1) {
    const row = rows.find((r) => r._id.year === cursor.getFullYear() && r._id.month === cursor.getMonth() + 1);
    out.push({
      label: cursor.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      totalPaisa: row?.total ?? 0,
      count: row?.count ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/** Daily collections/expenses series for a selected range. */
export async function getDailySeries(from: Date, to: Date, location?: 'MACH' | 'QUETTA') {
  const locationMatch = location ? { location } : {};
  const [payments, expenses] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, paymentDate: { $gte: from, $lte: to }, ...locationMatch } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
          total: { $sum: '$amountPaisa' },
        },
      },
    ]),
    ExpenseTransaction.aggregate([
      { $match: { status: 'posted', amountPaisa: { $gt: 0 }, isOperatingExpense: true, transactionDate: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' } },
          total: { $sum: '$amountPaisa' },
        },
      },
    ]),
  ]);

  const payMap = new Map(payments.map((p) => [p._id, p.total]));
  const expMap = new Map(expenses.map((e) => [e._id, e.total]));

  const out: Array<{ label: string; collectionsPaisa: number; expensesPaisa: number }> = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({
      label: key,
      collectionsPaisa: payMap.get(key) ?? 0,
      expensesPaisa: expMap.get(key) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Expense totals grouped by category for the selected range. */
export async function getExpensesByCategory(from: Date, to: Date, location?: 'MACH' | 'QUETTA') {
  const match: Record<string, unknown> = {
    status: 'posted',
    amountPaisa: { $gt: 0 },
    transactionDate: { $gte: from, $lte: to },
  };
  if (location) match.location = location;

  const rows = await ExpenseTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amountPaisa' },
        count: { $sum: 1 },
        operating: { $sum: { $cond: ['$isOperatingExpense', '$amountPaisa', 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({
    category: r._id,
    totalPaisa: r.total,
    operatingPaisa: r.operating,
    count: r.count,
  }));
}

/** Cash movement in/out grouped by account for the selected range. */
export async function getCashPosition(from: Date, to: Date) {
  const accounts = await FinancialAccount.find({ isActive: true }).lean();
  const rows = await CashMovement.aggregate([
    { $match: { status: 'posted', movementDate: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { account: '$account', name: '$accountName', type: '$accountType' },
        inflow: { $sum: { $cond: [{ $eq: ['$direction', 'IN'] }, '$amountPaisa', 0] } },
        outflow: { $sum: { $cond: [{ $eq: ['$direction', 'OUT'] }, '$amountPaisa', 0] } },
      },
    },
  ]);

  return accounts.map((a) => {
    const row = rows.find((r) => String(r._id.account) === String(a._id));
    return {
      accountId: String(a._id),
      name: a.name,
      type: a.type,
      openingBalancePaisa: a.openingBalancePaisa,
      inflowPaisa: row?.inflow ?? 0,
      outflowPaisa: row?.outflow ?? 0,
      closingBalancePaisa: a.balancePaisa,
      calculatedClosingPaisa: a.openingBalancePaisa + (row?.inflow ?? 0) - (row?.outflow ?? 0),
    };
  });
}

/** Collections split by location (Mach / Quetta). */
export async function getCollectionsByLocation(from: Date, to: Date) {
  const rows = await Payment.aggregate([
    { $match: { status: 'posted', amountPaisa: { $gt: 0 }, paymentDate: { $gte: from, $lte: to } } },
    { $group: { _id: '$location', total: { $sum: '$amountPaisa' }, count: { $sum: 1 } } },
  ]);
  return SCHEME.LOCATIONS.map((loc) => {
    const row = rows.find((r) => r._id === loc);
    return { location: loc, totalPaisa: row?.total ?? 0, count: row?.count ?? 0 };
  });
}

/** Collections grouped by installment month number. */
export async function getCollectionsByInstallmentMonth(from: Date, to: Date) {
  const rows = await Payment.aggregate([
    { $match: { status: 'posted', amountPaisa: { $gt: 0 }, paymentDate: { $gte: from, $lte: to } } },
    { $unwind: '$allocations' },
    { $group: { _id: '$allocations.monthNumber', total: { $sum: '$allocations.amountPaisa' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ monthNumber: r._id, totalPaisa: r.total, count: r.count }));
}

export { Types };
