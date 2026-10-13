import { Types } from 'mongoose';
import {
  AuditLog,
  CashMovement,
  Customer,
  CustomerAdvance,
  CustomerClosure,
  DrawEvent,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  Installment,
  Partner,
  PartnerTransaction,
  Payment,
  SchemeEnrollment,
} from '../models';
import { SCHEME } from '../constants';
import { endOfMonth, startOfMonth } from '../utils/money';
import { getSettings } from './settings.service';

/**
 * Report data builders (Module K).
 *
 * Every report reads the same collections the screens read, with the same filters, so an
 * export always reconciles with what is displayed in the application.
 */

export interface ReportFilter {
  dateFrom?: Date;
  dateTo?: Date;
  location?: 'MACH' | 'QUETTA';
  status?: string;
  category?: string;
  method?: string;
  schemeMonth?: number;
  partnerId?: string;
  customerId?: string;
  tokenNumber?: number;
}

export interface ReportSheet {
  name: string;
  title: string;
  columns: Array<{ header: string; key: string; width?: number; type?: 'text' | 'number' | 'money' | 'date' }>;
  rows: Array<Record<string, unknown>>;
  totals?: Array<{ label: string; value: number; money?: boolean }>;
}

export interface ReportBundle {
  reportId: string;
  title: string;
  period: { from: string | null; to: string | null };
  generatedAt: string;
  generatedBy: string;
  filters: ReportFilter;
  sheets: ReportSheet[];
}

function periodOf(filter: ReportFilter) {
  return {
    from: filter.dateFrom ? filter.dateFrom.toISOString().slice(0, 10) : null,
    to: filter.dateTo ? filter.dateTo.toISOString().slice(0, 10) : null,
  };
}

function tokenCode(n: number | null | undefined): string {
  return n ? String(n).padStart(3, '0') : '';
}

export async function allCustomersReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const match: Record<string, unknown> = {};
  if (filter.location) match.location = filter.location;
  if (filter.status) match.status = filter.status;

  const customers = await Customer.find(match).sort({ name: 1 }).lean();
  const enrollments = await SchemeEnrollment.find({ customer: { $in: customers.map((c) => c._id) } }).lean();
  const byCustomer = new Map(enrollments.map((e) => [String(e.customer), e]));

  const rows = customers.map((c) => {
    const e = byCustomer.get(String(c._id));
    return {
      token: tokenCode(e?.tokenNumber),
      customerCode: c.customerCode,
      name: c.name,
      cnic: c.cnicFormatted || c.cnic,
      phone: c.phone,
      location: c.location,
      joiningDate: c.joiningDate,
      monthlyInstallment: (e?.monthlyInstallmentPaisa ?? 0) / 100,
      schemeTotal: (e?.schemeTotalPaisa ?? 0) / 100,
      totalPaid: (e?.totalPaidPaisa ?? 0) / 100,
      outstanding: (e?.outstandingPaisa ?? 0) / 100,
      status: c.status,
      drawStatus: c.drawStatus,
    };
  });

  return bundle('all-customers', 'All Customers Report', filter, actorName, [
    {
      name: 'Customers',
      title: 'All Customers',
      columns: [
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Customer ID', key: 'customerCode', width: 14 },
        { header: 'Name', key: 'name', width: 26 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Phone', key: 'phone', width: 16, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Joining Date', key: 'joiningDate', width: 13, type: 'date' },
        { header: 'Monthly Installment', key: 'monthlyInstallment', width: 18, type: 'money' },
        { header: 'Scheme Total', key: 'schemeTotal', width: 15, type: 'money' },
        { header: 'Total Paid', key: 'totalPaid', width: 14, type: 'money' },
        { header: 'Outstanding', key: 'outstanding', width: 14, type: 'money' },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Draw Status', key: 'drawStatus', width: 13 },
      ],
      rows,
      totals: [
        { label: 'Customers', value: rows.length },
        { label: 'Scheme total', value: rows.reduce((s, r) => s + Number(r.schemeTotal), 0), money: true },
        { label: 'Total paid', value: rows.reduce((s, r) => s + Number(r.totalPaid), 0), money: true },
        { label: 'Outstanding', value: rows.reduce((s, r) => s + Number(r.outstanding), 0), money: true },
      ],
    },
  ]);
}

export async function collectionsReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const match: Record<string, unknown> = { status: 'posted' };
  if (filter.dateFrom || filter.dateTo) {
    match.paymentDate = {};
    if (filter.dateFrom) (match.paymentDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.paymentDate as Record<string, Date>).$lte = filter.dateTo;
  }
  if (filter.location) match.location = filter.location;
  if (filter.method) match.method = filter.method;
  if (filter.tokenNumber) match.tokenNumber = filter.tokenNumber;
  if (filter.customerId) match.customer = new Types.ObjectId(filter.customerId);

  const payments = await Payment.find(match)
    .sort({ paymentDate: 1 })
    .populate('customer', 'name cnic phone location')
    .lean();

  const rows = payments.map((p) => {
    const c = p.customer as unknown as Record<string, unknown> | undefined;
    return {
      date: p.paymentDate,
      receipt: p.paymentNumber,
      token: tokenCode(p.tokenNumber),
      customer: String(c?.name ?? ''),
      cnic: String(c?.cnic ?? ''),
      location: p.location,
      method: p.method,
      account: p.accountName,
      months: (p.allocations ?? []).map((a) => a.monthNumber).join(', ') || 'Credit',
      amount: p.amountPaisa / 100,
      allocated: p.allocatedPaisa / 100,
      unallocated: p.unallocatedPaisa / 100,
      status: p.status,
      enteredBy: p.enteredByName,
    };
  });

  const byMethod = groupSum(rows, 'method', 'amount');
  const byLocation = groupSum(rows, 'location', 'amount');

  return bundle('collections', 'Customer Collections Report', filter, actorName, [
    {
      name: 'Collections',
      title: 'Customer Collections',
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Receipt / Payment No', key: 'receipt', width: 24, type: 'text' },
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Customer', key: 'customer', width: 24 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Method', key: 'method', width: 10 },
        { header: 'Account', key: 'account', width: 18 },
        { header: 'Months', key: 'months', width: 14, type: 'text' },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Allocated', key: 'allocated', width: 13, type: 'money' },
        { header: 'Unallocated', key: 'unallocated', width: 13, type: 'money' },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Entered By', key: 'enteredBy', width: 18 },
      ],
      rows,
      totals: [
        { label: 'Payments', value: rows.length },
        { label: 'Total collected', value: rows.reduce((s, r) => s + Number(r.amount), 0), money: true },
      ],
    },
    { name: 'By Method', title: 'Collections by Payment Method', columns: kvColumns('Method'), rows: byMethod, totals: [{ label: 'Total', value: byMethod.reduce((s, r) => s + Number(r.value), 0), money: true }] },
    { name: 'By Location', title: 'Collections by Location', columns: kvColumns('Location'), rows: byLocation, totals: [{ label: 'Total', value: byLocation.reduce((s, r) => s + Number(r.value), 0), money: true }] },
  ]);
}

export async function installmentScheduleReport(customerId: string, actorName: string): Promise<ReportBundle> {
  if (!Types.ObjectId.isValid(customerId)) throw new Error('Invalid customer id');
  const customer = await Customer.findById(customerId).lean();
  if (!customer) throw new Error('Customer not found');
  const enrollment = await SchemeEnrollment.findOne({ customer: customer._id }).sort({ createdAt: -1 }).lean();
  if (!enrollment) throw new Error('No enrollment found for this customer');

  const [installments, payments, draws, advances, closures] = await Promise.all([
    Installment.find({ enrollment: enrollment._id }).sort({ monthNumber: 1 }).lean(),
    Payment.find({ customer: customer._id }).sort({ paymentDate: 1 }).lean(),
    DrawEvent.find({ winnerCustomer: customer._id }).lean(),
    CustomerAdvance.find({ customer: customer._id }).lean(),
    CustomerClosure.find({ customer: customer._id }).lean(),
  ]);

  const settings = await getSettings();

  const scheduleRows = installments.map((i) => ({
    month: i.monthNumber,
    dueDate: i.dueDate,
    scheduled: i.scheduledPaisa / 100,
    paid: i.paidPaisa / 100,
    adjusted: i.adjustedPaisa / 100,
    outstanding: i.outstandingPaisa / 100,
    status: i.status,
    note: i.notApplicableReason ?? i.adjustmentReason ?? '',
  }));

  const paymentRows = payments.map((p) => ({
    date: p.paymentDate,
    receipt: p.paymentNumber,
    method: p.method,
    months: (p.allocations ?? []).map((a) => a.monthNumber).join(', ') || 'Unallocated credit',
    amount: p.amountPaisa / 100,
    status: p.status,
    enteredBy: p.enteredByName,
    reason: p.reversalReason ?? '',
  }));

  const drawRows = draws.map((d) => ({
    schemeMonth: d.schemeMonth,
    drawDate: d.drawDate,
    status: d.status,
    winnerToken: tokenCode(d.winnerTokenNumber),
    reference: d.reference ?? '',
    confirmedAt: d.confirmedAt ?? null,
    approvedBy: d.approvedByName ?? '',
    corrections: d.corrections?.length ?? 0,
  }));

  const advanceRows = advances.map((a) => ({
    code: a.advanceCode,
    type: a.type,
    date: a.advanceDate,
    amount: a.amountPaisa / 100,
    status: a.status,
    approver: a.approver ?? '',
    installmentsContinue: a.stopsInstallments ? 'No' : 'Yes',
  }));

  const closureRows = closures.map((c) => ({
    closedAt: c.closedAt,
    reason: c.reason,
    stoppedFromMonth: c.stoppedFromMonth,
    totalPaid: c.totalPaidPaisa / 100,
    waived: c.outstandingWaivedPaisa / 100,
    status: c.status,
    closedBy: c.closedByName ?? '',
  }));

  return bundle('customer-statement', `Customer Statement - ${customer.name}`, {}, actorName, [
    {
      name: 'Overview',
      title: `${settings.businessName} - Customer Statement`,
      columns: [
        { header: 'Field', key: 'field', width: 30 },
        { header: 'Value', key: 'value', width: 40, type: 'text' },
      ],
      rows: [
        { field: 'Customer ID', value: customer.customerCode },
        { field: 'Name', value: customer.name },
        { field: 'CNIC', value: customer.cnicFormatted || customer.cnic },
        { field: 'Phone', value: customer.phone },
        { field: 'Location', value: customer.location },
        { field: 'Token', value: tokenCode(enrollment.tokenNumber) },
        { field: 'Joining date', value: customer.joiningDate.toISOString().slice(0, 10) },
        { field: 'Monthly installment (PKR)', value: enrollment.monthlyInstallmentPaisa / 100 },
        { field: 'Scheme duration (months)', value: SCHEME.INSTALLMENT_MONTHS },
        { field: 'Scheme total (PKR)', value: enrollment.schemeTotalPaisa / 100 },
        { field: 'Total paid (PKR)', value: enrollment.totalPaidPaisa / 100 },
        { field: 'Remaining scheduled (PKR)', value: enrollment.outstandingPaisa / 100 },
        { field: 'Customer status', value: customer.status },
        { field: 'Draw status', value: customer.drawStatus },
      ],
    },
    {
      name: 'Installment Ledger',
      title: '28-Month Installment Ledger',
      columns: [
        { header: 'Month', key: 'month', width: 8, type: 'number' },
        { header: 'Due Date', key: 'dueDate', width: 12, type: 'date' },
        { header: 'Scheduled (PKR)', key: 'scheduled', width: 16, type: 'money' },
        { header: 'Paid (PKR)', key: 'paid', width: 14, type: 'money' },
        { header: 'Adjusted (PKR)', key: 'adjusted', width: 14, type: 'money' },
        { header: 'Outstanding (PKR)', key: 'outstanding', width: 16, type: 'money' },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Note', key: 'note', width: 34 },
      ],
      rows: scheduleRows,
      totals: [
        { label: 'Scheduled total', value: scheduleRows.reduce((s, r) => s + r.scheduled, 0), money: true },
        { label: 'Total paid', value: scheduleRows.reduce((s, r) => s + r.paid, 0), money: true },
        { label: 'Outstanding', value: scheduleRows.reduce((s, r) => s + r.outstanding, 0), money: true },
      ],
    },
    {
      name: 'Payments',
      title: 'Payments and Receipts',
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Receipt / Payment', key: 'receipt', width: 24, type: 'text' },
        { header: 'Method', key: 'method', width: 10 },
        { header: 'Months', key: 'months', width: 16, type: 'text' },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Entered By', key: 'enteredBy', width: 18 },
        { header: 'Reason', key: 'reason', width: 30 },
      ],
      rows: paymentRows,
      totals: [{ label: 'Net paid', value: paymentRows.reduce((s, r) => s + r.amount, 0), money: true }],
    },
    {
      name: 'Draw History',
      title: 'Draw History',
      columns: [
        { header: 'Scheme Month', key: 'schemeMonth', width: 13, type: 'number' },
        { header: 'Draw Date', key: 'drawDate', width: 12, type: 'date' },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Winning Token', key: 'winnerToken', width: 13, type: 'text' },
        { header: 'Reference', key: 'reference', width: 20 },
        { header: 'Confirmed At', key: 'confirmedAt', width: 18 },
        { header: 'Approved By', key: 'approvedBy', width: 18 },
        { header: 'Corrections', key: 'corrections', width: 12, type: 'number' },
      ],
      rows: drawRows,
    },
    {
      name: 'Advances',
      title: 'Advance Arrangements',
      columns: [
        { header: 'Code', key: 'code', width: 14, type: 'text' },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Amount / Value (PKR)', key: 'amount', width: 20, type: 'money' },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Approver', key: 'approver', width: 20 },
        { header: 'Installments Continue', key: 'installmentsContinue', width: 20 },
      ],
      rows: advanceRows,
    },
    {
      name: 'Closure',
      title: 'Closure Records',
      columns: [
        { header: 'Closed At', key: 'closedAt', width: 18 },
        { header: 'Reason', key: 'reason', width: 22 },
        { header: 'Stopped From Month', key: 'stoppedFromMonth', width: 18, type: 'number' },
        { header: 'Total Paid (PKR)', key: 'totalPaid', width: 16, type: 'money' },
        { header: 'Waived (PKR)', key: 'waived', width: 14, type: 'money' },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Closed By', key: 'closedBy', width: 18 },
      ],
      rows: closureRows,
    },
  ]);
}

export async function drawReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const match: Record<string, unknown> = {};
  if (filter.schemeMonth) match.schemeMonth = filter.schemeMonth;
  if (filter.status) match.status = filter.status;
  if (filter.dateFrom || filter.dateTo) {
    match.drawDate = {};
    if (filter.dateFrom) (match.drawDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.drawDate as Record<string, Date>).$lte = filter.dateTo;
  }

  const draws = await DrawEvent.find(match).sort({ schemeMonth: 1 }).lean();
  const closures = await CustomerClosure.find({ reason: 'DRAW_WIN' }).lean();
  const closureByDraw = new Map(closures.map((c) => [String(c.drawEvent), c]));

  const registerRows = draws.map((d) => {
    const closure = closureByDraw.get(String(d._id));
    return {
      schemeMonth: d.schemeMonth,
      drawDate: d.drawDate,
      eligibleCount: d.eligibleCount,
      eligibleTokens: d.eligibleSnapshot.map((s) => String(s.tokenNumber).padStart(3, '0')).join(', '),
      winnerToken: tokenCode(d.winnerTokenNumber),
      winner: d.winnerName ?? '',
      status: d.status,
      reference: d.reference ?? '',
      recordedBy: d.operatorName ?? '',
      approvedBy: d.approvedByName ?? '',
      confirmedAt: d.confirmedAt ?? null,
      closedAt: closure?.closedAt ?? null,
      corrections: d.corrections?.length ?? 0,
    };
  });

  const drawnCustomers = await Customer.find({ status: 'drawn_closed' }).lean();
  const drawnRows = drawnCustomers.map((c) => {
    const closure = closures.find((x) => String(x.customer) === String(c._id));
    return {
      token: tokenCode(closure?.tokenNumber),
      name: c.name,
      cnic: c.cnicFormatted || c.cnic,
      location: c.location,
      drawMonth: closure?.stoppedFromMonth ?? null,
      closedAt: closure?.closedAt ?? null,
      totalPaid: (closure?.totalPaidPaisa ?? 0) / 100,
      waived: (closure?.outstandingWaivedPaisa ?? 0) / 100,
      status: c.status,
    };
  });

  return bundle('draws', 'Draw Register and History', filter, actorName, [
    {
      name: 'Draw Register',
      title: 'Monthly Qurandazi Register',
      columns: [
        { header: 'Scheme Month', key: 'schemeMonth', width: 13, type: 'number' },
        { header: 'Draw Date', key: 'drawDate', width: 12, type: 'date' },
        { header: 'Eligible', key: 'eligibleCount', width: 10, type: 'number' },
        { header: 'Eligible Tokens', key: 'eligibleTokens', width: 50, type: 'text' },
        { header: 'Winner Token', key: 'winnerToken', width: 12, type: 'text' },
        { header: 'Winner', key: 'winner', width: 24 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Reference', key: 'reference', width: 18 },
        { header: 'Recorded By', key: 'recordedBy', width: 18 },
        { header: 'Approved By', key: 'approvedBy', width: 18 },
        { header: 'Confirmed At', key: 'confirmedAt', width: 18 },
        { header: 'Closed At', key: 'closedAt', width: 18 },
        { header: 'Corrections', key: 'corrections', width: 12, type: 'number' },
      ],
      rows: registerRows,
      totals: [{ label: 'Draws', value: registerRows.length }],
    },
    {
      name: 'Drawn Customers',
      title: 'Drawn / Closed Customers',
      columns: [
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Draw Month', key: 'drawMonth', width: 12, type: 'number' },
        { header: 'Closed At', key: 'closedAt', width: 18 },
        { header: 'Total Paid (PKR)', key: 'totalPaid', width: 16, type: 'money' },
        { header: 'Waived (PKR)', key: 'waived', width: 14, type: 'money' },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: drawnRows,
      totals: [
        { label: 'Customers', value: drawnRows.length },
        { label: 'Total paid', value: drawnRows.reduce((s, r) => s + Number(r.totalPaid), 0), money: true },
      ],
    },
  ]);
}

export async function advancesReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const match: Record<string, unknown> = {};
  if (filter.status) match.status = filter.status;
  if (filter.location) match.location = filter.location;
  if (filter.tokenNumber) match.tokenNumber = filter.tokenNumber;
  if (filter.dateFrom || filter.dateTo) {
    match.advanceDate = {};
    if (filter.dateFrom) (match.advanceDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.advanceDate as Record<string, Date>).$lte = filter.dateTo;
  }

  const items = await CustomerAdvance.find(match)
    .sort({ advanceDate: -1 })
    .populate('customer', 'name cnic phone location status drawStatus')
    .lean();

  const mapRow = (a: (typeof items)[number]) => {
    const c = a.customer as unknown as Record<string, unknown> | undefined;
    return {
      token: tokenCode(a.tokenNumber),
      customer: String(c?.name ?? ''),
      cnic: String(c?.cnic ?? ''),
      location: a.location,
      date: a.advanceDate,
      amount: a.amountPaisa / 100,
      details: a.type === 'BIKE' ? [a.bikeModel, a.bikeDescription].filter(Boolean).join(' - ') : (a.purpose ?? ''),
      method: a.method ?? '',
      approver: a.approver ?? '',
      reference: a.supportingReference ?? '',
      status: a.status,
      installmentsContinue: a.stopsInstallments ? 'No' : 'Yes',
      customerStatus: String(c?.status ?? ''),
    };
  };

  const bikes = items.filter((a) => a.type === 'BIKE').map(mapRow);
  const cash = items.filter((a) => a.type === 'CASH').map(mapRow);

  return bundle('advances', 'Advance Bike and Advance Cash Cases', filter, actorName, [
    {
      name: 'Advance Bike',
      title: 'Advance Bike Cases',
      columns: [
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Customer', key: 'customer', width: 24 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Agreed Value (PKR)', key: 'amount', width: 18, type: 'money' },
        { header: 'Bike Details', key: 'details', width: 34 },
        { header: 'Approver', key: 'approver', width: 18 },
        { header: 'Reference', key: 'reference', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Installments Continue', key: 'installmentsContinue', width: 20 },
        { header: 'Customer Status', key: 'customerStatus', width: 16 },
      ],
      rows: bikes,
      totals: [
        { label: 'Cases', value: bikes.length },
        { label: 'Total agreed value', value: bikes.reduce((s, r) => s + Number(r.amount), 0), money: true },
      ],
    },
    {
      name: 'Advance Cash',
      title: 'Advance Cash Cases',
      columns: [
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Customer', key: 'customer', width: 24 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Cash Amount (PKR)', key: 'amount', width: 18, type: 'money' },
        { header: 'Purpose', key: 'details', width: 30 },
        { header: 'Method', key: 'method', width: 10 },
        { header: 'Approver', key: 'approver', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Installments Continue', key: 'installmentsContinue', width: 20 },
        { header: 'Customer Status', key: 'customerStatus', width: 16 },
      ],
      rows: cash,
      totals: [
        { label: 'Cases', value: cash.length },
        { label: 'Total advance cash issued', value: cash.reduce((s, r) => s + Number(r.amount), 0), money: true },
      ],
    },
  ]);
}

export async function expensesReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const match: Record<string, unknown> = { status: 'posted' };
  if (filter.category) match.category = filter.category;
  if (filter.location) match.location = filter.location;
  if (filter.method) match.method = filter.method;
  if (filter.dateFrom || filter.dateTo) {
    match.transactionDate = {};
    if (filter.dateFrom) (match.transactionDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.transactionDate as Record<string, Date>).$lte = filter.dateTo;
  }

  const items = await ExpenseTransaction.find(match).sort({ transactionDate: 1 }).lean();
  const rows = items.map((e) => ({
    date: e.transactionDate,
    transactionId: e.transactionId,
    category: e.category,
    subCategory: e.subCategory ?? '',
    amount: e.amountPaisa / 100,
    operating: e.isOperatingExpense ? 'Yes' : 'No',
    method: e.method,
    account: e.accountName ?? '',
    paidTo: e.paidTo ?? '',
    partner: e.partnerName ?? '',
    location: e.location ?? '',
    purpose: e.purpose ?? '',
    enteredBy: e.enteredByName ?? '',
  }));

  const byCategory = groupSum(rows, 'category', 'amount');
  const operatingTotal = rows.filter((r) => r.operating === 'Yes').reduce((s, r) => s + Number(r.amount), 0);
  const advanceTotal = rows.filter((r) => r.category === 'CUSTOMER_ADVANCE_CASH').reduce((s, r) => s + Number(r.amount), 0);
  const partnerTotal = rows.filter((r) => r.category === 'PARTNER_WITHDRAWAL').reduce((s, r) => s + Number(r.amount), 0);

  return bundle('expenses', 'Expense Report', filter, actorName, [
    {
      name: 'Expenses',
      title: 'Expense Transactions',
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Transaction ID', key: 'transactionId', width: 18, type: 'text' },
        { header: 'Category', key: 'category', width: 22 },
        { header: 'Sub Category', key: 'subCategory', width: 16 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Operating Expense', key: 'operating', width: 18 },
        { header: 'Method', key: 'method', width: 10 },
        { header: 'Account', key: 'account', width: 18 },
        { header: 'Paid To', key: 'paidTo', width: 20 },
        { header: 'Partner', key: 'partner', width: 18 },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Purpose', key: 'purpose', width: 30 },
        { header: 'Entered By', key: 'enteredBy', width: 18 },
      ],
      rows,
      totals: [
        { label: 'Transactions', value: rows.length },
        { label: 'Total cash outflow (expenses)', value: rows.reduce((s, r) => s + Number(r.amount), 0), money: true },
        { label: 'Operating expenses only', value: operatingTotal, money: true },
        { label: 'Customer advance cash', value: advanceTotal, money: true },
        { label: 'Partner withdrawals', value: partnerTotal, money: true },
      ],
    },
    { name: 'By Category', title: 'Expenses by Category', columns: kvColumns('Category'), rows: byCategory, totals: [{ label: 'Total', value: byCategory.reduce((s, r) => s + Number(r.value), 0), money: true }] },
  ]);
}

export async function partnersReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const partners = await Partner.find({}).sort({ partnerCode: 1 }).lean();
  const match: Record<string, unknown> = { status: 'posted' };
  if (filter.dateFrom || filter.dateTo) {
    match.transactionDate = {};
    if (filter.dateFrom) (match.transactionDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.transactionDate as Record<string, Date>).$lte = filter.dateTo;
  }
  if (filter.partnerId) match.partner = new Types.ObjectId(filter.partnerId);

  const txns = await PartnerTransaction.find(match).sort({ transactionDate: 1 }).lean();

  const sheets: ReportSheet[] = partners.map((p) => {
    const rows = txns
      .filter((t) => String(t.partner) === String(p._id))
      .map((t) => ({
        date: t.transactionDate,
        transactionId: t.transactionId,
        type: t.type,
        amount: t.amountPaisa / 100,
        cashEffect: t.cashEffectPaisa / 100,
        method: t.method,
        account: t.accountName ?? '',
        purpose: t.purpose ?? '',
        reference: t.reference ?? '',
        enteredBy: t.enteredByName ?? '',
      }));
    return {
      name: p.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 28) || p.partnerCode,
      title: `Partner Statement - ${p.name}`,
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Transaction ID', key: 'transactionId', width: 18, type: 'text' },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Cash Effect (PKR)', key: 'cashEffect', width: 17, type: 'money' },
        { header: 'Method', key: 'method', width: 10 },
        { header: 'Account', key: 'account', width: 18 },
        { header: 'Purpose', key: 'purpose', width: 30 },
        { header: 'Reference', key: 'reference', width: 16 },
        { header: 'Entered By', key: 'enteredBy', width: 18 },
      ],
      rows,
      totals: [
        { label: 'Total withdrawals', value: p.totalWithdrawnPaisa / 100, money: true },
        { label: 'Total contributions', value: p.totalContributedPaisa / 100, money: true },
        { label: 'Total repayments', value: p.totalRepaidPaisa / 100, money: true },
        { label: 'Net cash movement', value: p.netCashPaisa / 100, money: true },
      ],
    };
  });

  sheets.unshift({
    name: 'Summary',
    title: 'Partner Comparison',
    columns: [
      { header: 'Partner ID', key: 'partnerCode', width: 12, type: 'text' },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Withdrawals (PKR)', key: 'withdrawn', width: 18, type: 'money' },
      { header: 'Contributions (PKR)', key: 'contributed', width: 18, type: 'money' },
      { header: 'Repayments (PKR)', key: 'repaid', width: 18, type: 'money' },
      { header: 'Net Cash (PKR)', key: 'net', width: 16, type: 'money' },
    ],
    rows: partners.map((p) => ({
      partnerCode: p.partnerCode,
      name: p.name,
      withdrawn: p.totalWithdrawnPaisa / 100,
      contributed: p.totalContributedPaisa / 100,
      repaid: p.totalRepaidPaisa / 100,
      net: p.netCashPaisa / 100,
    })),
    totals: [
      { label: 'Combined withdrawals', value: partners.reduce((s, p) => s + p.totalWithdrawnPaisa, 0) / 100, money: true },
      { label: 'Combined contributions', value: partners.reduce((s, p) => s + p.totalContributedPaisa, 0) / 100, money: true },
    ],
  });

  return bundle('partners', 'Partner Accounts Report', filter, actorName, sheets);
}

export async function cashBankReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const accounts = await FinancialAccount.find({}).sort({ type: 1, name: 1 }).lean();
  const match: Record<string, unknown> = { status: 'posted' };
  if (filter.dateFrom || filter.dateTo) {
    match.movementDate = {};
    if (filter.dateFrom) (match.movementDate as Record<string, Date>).$gte = filter.dateFrom;
    if (filter.dateTo) (match.movementDate as Record<string, Date>).$lte = filter.dateTo;
  }
  const movements = await CashMovement.find(match).sort({ movementDate: 1 }).lean();

  const sheets: ReportSheet[] = accounts.map((a) => {
    const rows = movements
      .filter((m) => String(m.account) === String(a._id))
      .map((m) => ({
        date: m.movementDate,
        description: m.description ?? '',
        source: m.sourceType,
        reference: m.reference ?? '',
        inflow: m.direction === 'IN' ? m.amountPaisa / 100 : 0,
        outflow: m.direction === 'OUT' ? m.amountPaisa / 100 : 0,
      }));
    const totalIn = rows.reduce((s, r) => s + r.inflow, 0);
    const totalOut = rows.reduce((s, r) => s + r.outflow, 0);
    return {
      name: `${a.type}-${a.name}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 28),
      title: `${a.type} Ledger - ${a.name}`,
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Source', key: 'source', width: 20 },
        { header: 'Reference', key: 'reference', width: 20, type: 'text' },
        { header: 'Inflow (PKR)', key: 'inflow', width: 15, type: 'money' },
        { header: 'Outflow (PKR)', key: 'outflow', width: 15, type: 'money' },
      ],
      rows,
      totals: [
        { label: 'Opening balance', value: a.openingBalancePaisa / 100, money: true },
        { label: 'Total inflow', value: totalIn, money: true },
        { label: 'Total outflow', value: totalOut, money: true },
        { label: 'Closing balance', value: (a.openingBalancePaisa + totalIn * 100 - totalOut * 100) / 100, money: true },
      ],
    };
  });

  sheets.unshift({
    name: 'Summary',
    title: 'Cash and Bank Summary',
    columns: [
      { header: 'Account', key: 'name', width: 26 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Opening (PKR)', key: 'opening', width: 16, type: 'money' },
      { header: 'Inflow (PKR)', key: 'inflow', width: 16, type: 'money' },
      { header: 'Outflow (PKR)', key: 'outflow', width: 16, type: 'money' },
      { header: 'Closing (PKR)', key: 'closing', width: 16, type: 'money' },
    ],
    rows: accounts.map((a) => {
      const accMovements = movements.filter((m) => String(m.account) === String(a._id));
      const inflow = accMovements.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amountPaisa, 0) / 100;
      const outflow = accMovements.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amountPaisa, 0) / 100;
      return {
        name: a.name,
        type: a.type,
        opening: a.openingBalancePaisa / 100,
        inflow,
        outflow,
        closing: a.openingBalancePaisa / 100 + inflow - outflow,
      };
    }),
    totals: [
      {
        label: 'Combined closing balance',
        value: accounts.reduce((s, a) => s + a.openingBalancePaisa, 0) / 100,
        money: true,
      },
    ],
  });

  return bundle('cash-bank', 'Cash and Bank Ledger Report', filter, actorName, sheets);
}

export async function financialSummaryReport(filter: ReportFilter, actorName: string): Promise<ReportBundle> {
  const from = filter.dateFrom ?? startOfMonth(new Date());
  const to = filter.dateTo ?? endOfMonth(new Date());

  const [payments, incomes, expenses, partnerTxns, movements] = await Promise.all([
    Payment.find({ status: 'posted', paymentDate: { $gte: from, $lte: to } }).lean(),
    IncomeTransaction.find({ status: 'posted', transactionDate: { $gte: from, $lte: to } }).lean(),
    ExpenseTransaction.find({ status: 'posted', transactionDate: { $gte: from, $lte: to } }).lean(),
    PartnerTransaction.find({ status: 'posted', transactionDate: { $gte: from, $lte: to } }).lean(),
    CashMovement.find({ status: 'posted', movementDate: { $gte: from, $lte: to } }).lean(),
  ]);

  const customerCollections = payments.reduce((s, p) => s + p.amountPaisa, 0);
  const otherIncome = incomes.filter((i) => i.isRevenue && i.sourceType !== 'CUSTOMER_PAYMENT').reduce((s, i) => s + i.amountPaisa, 0);
  const revenue = customerCollections + otherIncome;
  const funding = incomes.filter((i) => !i.isRevenue).reduce((s, i) => s + i.amountPaisa, 0);
  const operating = expenses.filter((e) => e.isOperatingExpense).reduce((s, e) => s + e.amountPaisa, 0);
  const advances = expenses.filter((e) => e.category === 'CUSTOMER_ADVANCE_CASH').reduce((s, e) => s + e.amountPaisa, 0);
  const withdrawals = partnerTxns.filter((t) => t.type === 'WITHDRAWAL').reduce((s, t) => s + t.amountPaisa, 0);
  const contributions = partnerTxns.filter((t) => t.type === 'CONTRIBUTION').reduce((s, t) => s + t.amountPaisa, 0);
  const repayments = partnerTxns.filter((t) => t.type === 'REPAYMENT').reduce((s, t) => s + t.amountPaisa, 0);
  const inflow = movements.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amountPaisa, 0);
  const outflow = movements.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amountPaisa, 0);
  const accounts = await FinancialAccount.find({}).lean();
  const cashClosing = accounts.filter((a) => a.type === 'CASH').reduce((s, a) => s + a.balancePaisa, 0);
  const bankClosing = accounts.filter((a) => a.type === 'BANK').reduce((s, a) => s + a.balancePaisa, 0);

  const rows = [
    { measure: 'Total revenue / income', amount: revenue / 100 },
    { measure: 'Customer collections (installments)', amount: customerCollections / 100 },
    { measure: 'Other business revenue', amount: otherIncome / 100 },
    { measure: 'Partner capital contributions (funding, not revenue)', amount: contributions / 100 },
    { measure: 'Partner repayments (funding, not revenue)', amount: repayments / 100 },
    { measure: 'Loans / other funding', amount: funding / 100 },
    { measure: 'Operating expenses', amount: operating / 100 },
    { measure: 'Customer advance cash (outflow, not operating)', amount: advances / 100 },
    { measure: 'Partner withdrawals (outflow, not operating)', amount: withdrawals / 100 },
    { measure: 'Total cash inflow', amount: inflow / 100 },
    { measure: 'Total cash outflow', amount: outflow / 100 },
    { measure: 'Net cash movement', amount: (inflow - outflow) / 100 },
    { measure: 'Closing cash balance', amount: cashClosing / 100 },
    { measure: 'Closing bank balance', amount: bankClosing / 100 },
    { measure: 'Combined closing balance', amount: (cashClosing + bankClosing) / 100 },
  ];

  return bundle('financial-summary', 'Monthly Financial Summary', filter, actorName, [
    {
      name: 'Summary',
      title: 'Financial Summary',
      columns: [
        { header: 'Measure', key: 'measure', width: 52 },
        { header: 'Amount (PKR)', key: 'amount', width: 18, type: 'money' },
      ],
      rows,
    },
  ]);
}

/** Complete authorised archive of every financial and operational record type. */
export async function archiveReport(actorName: string): Promise<ReportBundle> {
  const [customers, payments, draws, advances, incomes, expenses, partnerTxns, movements, audits] = await Promise.all([
    Customer.find({}).lean(),
    Payment.find({}).sort({ paymentDate: 1 }).lean(),
    DrawEvent.find({}).sort({ schemeMonth: 1 }).lean(),
    CustomerAdvance.find({}).sort({ advanceDate: 1 }).lean(),
    IncomeTransaction.find({}).sort({ transactionDate: 1 }).lean(),
    ExpenseTransaction.find({}).sort({ transactionDate: 1 }).lean(),
    PartnerTransaction.find({}).sort({ transactionDate: 1 }).lean(),
    CashMovement.find({}).sort({ movementDate: 1 }).lean(),
    AuditLog.find({}).sort({ createdAt: 1 }).limit(20000).lean(),
  ]);

  return bundle('archive', 'Complete Transaction Archive', {}, actorName, [
    {
      name: 'Customers',
      title: 'Customers',
      columns: [
        { header: 'ID', key: 'id', width: 26, type: 'text' },
        { header: 'Code', key: 'code', width: 14, type: 'text' },
        { header: 'Name', key: 'name', width: 26 },
        { header: 'CNIC', key: 'cnic', width: 18, type: 'text' },
        { header: 'Location', key: 'location', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: customers.map((c) => ({ id: String(c._id), code: c.customerCode, name: c.name, cnic: c.cnic, location: c.location, status: c.status })),
    },
    {
      name: 'Payments',
      title: 'Payments',
      columns: [
        { header: 'Number', key: 'number', width: 24, type: 'text' },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Token', key: 'token', width: 8, type: 'text' },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Reversal Reason', key: 'reason', width: 30 },
      ],
      rows: payments.map((p) => ({ number: p.paymentNumber, date: p.paymentDate, token: tokenCode(p.tokenNumber), amount: p.amountPaisa / 100, status: p.status, reason: p.reversalReason ?? '' })),
    },
    {
      name: 'Draws',
      title: 'Draw Events',
      columns: [
        { header: 'Month', key: 'month', width: 8, type: 'number' },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Winner Token', key: 'token', width: 12, type: 'text' },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Eligible', key: 'eligible', width: 10, type: 'number' },
      ],
      rows: draws.map((d) => ({ month: d.schemeMonth, date: d.drawDate, token: tokenCode(d.winnerTokenNumber), status: d.status, eligible: d.eligibleCount })),
    },
    {
      name: 'Advances',
      title: 'Advance Cases',
      columns: [
        { header: 'Code', key: 'code', width: 14, type: 'text' },
        { header: 'Type', key: 'type', width: 8 },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Status', key: 'status', width: 12 },
      ],
      rows: advances.map((a) => ({ code: a.advanceCode, type: a.type, date: a.advanceDate, amount: a.amountPaisa / 100, status: a.status })),
    },
    {
      name: 'Income',
      title: 'Income Transactions',
      columns: [
        { header: 'ID', key: 'id', width: 18, type: 'text' },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Category', key: 'category', width: 24 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Is Revenue', key: 'revenue', width: 12 },
        { header: 'Source', key: 'source', width: 20 },
      ],
      rows: incomes.map((i) => ({ id: i.transactionId, date: i.transactionDate, category: i.category, amount: i.amountPaisa / 100, revenue: i.isRevenue ? 'Yes' : 'No', source: i.sourceType })),
    },
    {
      name: 'Expenses',
      title: 'Expense Transactions',
      columns: [
        { header: 'ID', key: 'id', width: 18, type: 'text' },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Category', key: 'category', width: 24 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Operating', key: 'operating', width: 12 },
      ],
      rows: expenses.map((e) => ({ id: e.transactionId, date: e.transactionDate, category: e.category, amount: e.amountPaisa / 100, operating: e.isOperatingExpense ? 'Yes' : 'No' })),
    },
    {
      name: 'Partner Transactions',
      title: 'Partner Transactions',
      columns: [
        { header: 'ID', key: 'id', width: 18, type: 'text' },
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Partner', key: 'partner', width: 20 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
      ],
      rows: partnerTxns.map((t) => ({ id: t.transactionId, date: t.transactionDate, partner: t.partnerName, type: t.type, amount: t.amountPaisa / 100 })),
    },
    {
      name: 'Cash Movements',
      title: 'Cash / Bank Movements',
      columns: [
        { header: 'Date', key: 'date', width: 12, type: 'date' },
        { header: 'Account', key: 'account', width: 22 },
        { header: 'Direction', key: 'direction', width: 10 },
        { header: 'Amount (PKR)', key: 'amount', width: 15, type: 'money' },
        { header: 'Source', key: 'source', width: 20 },
        { header: 'Reference', key: 'reference', width: 20, type: 'text' },
      ],
      rows: movements.map((m) => ({ date: m.movementDate, account: m.accountName, direction: m.direction, amount: m.amountPaisa / 100, source: m.sourceType, reference: m.reference ?? '' })),
    },
    {
      name: 'Audit Log',
      title: 'Audit Log',
      columns: [
        { header: 'Timestamp', key: 'at', width: 22 },
        { header: 'User', key: 'user', width: 20 },
        { header: 'Action', key: 'action', width: 16 },
        { header: 'Entity', key: 'entity', width: 20 },
        { header: 'Record', key: 'record', width: 26, type: 'text' },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'Reason', key: 'reason', width: 30 },
      ],
      rows: audits.map((a) => ({
        at: a.createdAt,
        user: a.actorName ?? '',
        action: a.action,
        entity: a.entityType,
        record: a.entityId ?? '',
        description: a.description ?? '',
        reason: a.reason ?? '',
      })),
    },
  ]);
}

/* ------------------------------------------------------------------ helpers --------- */

function bundle(
  reportId: string,
  title: string,
  filter: ReportFilter,
  actorName: string,
  sheets: ReportSheet[]
): ReportBundle {
  return {
    reportId,
    title,
    period: periodOf(filter),
    generatedAt: new Date().toISOString(),
    generatedBy: actorName,
    filters: filter,
    sheets,
  };
}

function groupSum(rows: Array<Record<string, unknown>>, key: string, valueKey: string) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[key] ?? 'UNKNOWN');
    map.set(k, (map.get(k) ?? 0) + Number(r[valueKey] ?? 0));
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, value: Number(v.toFixed(2)), count: rows.filter((r) => String(r[key] ?? 'UNKNOWN') === k).length }));
}

function kvColumns(label: string) {
  return [
    { header: label, key: 'key', width: 28, type: 'text' as const },
    { header: 'Total (PKR)', key: 'value', width: 18, type: 'money' as const },
    { header: 'Count', key: 'count', width: 10, type: 'number' as const },
  ];
}

export const REPORT_BUILDERS = {
  customers: allCustomersReport,
  collections: collectionsReport,
  draws: drawReport,
  advances: advancesReport,
  expenses: expensesReport,
  partners: partnersReport,
  'cash-bank': cashBankReport,
  'financial-summary': financialSummaryReport,
  archive: archiveReport,
} as const;

export type ReportType = keyof typeof REPORT_BUILDERS;
