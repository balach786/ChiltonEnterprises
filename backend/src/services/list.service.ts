import { Types } from 'mongoose';
import {
  Customer,
  CustomerAdvance,
  CustomerClosure,
  Installment,
  SchemeEnrollment,
} from '../models';
import { serializeMoney } from '../utils/serialize';
import { getEligibleList } from './draw.service';
import { getTokenRegister } from './token.service';

/**
 * Module J - automatic lists (PRD p.14).
 *
 * Every list is derived from the stored status fields; nothing here can be edited by
 * hand, so a customer can never be "manually deleted" from a list.
 */

export interface ListOptions {
  location?: 'MACH' | 'QUETTA';
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Slice a fully-filtered list into a page. Totals are always computed over the whole
 * filtered set so the stat cards stay correct while the table stays small on slow links.
 */
function paginate<T>(rows: T[], options: ListOptions, fallbackLimit = 100) {
  const total = rows.length;
  const limit = Math.min(500, Math.max(1, Number(options.limit ?? fallbackLimit)));
  const page = Math.max(1, Number(options.page ?? 1));
  const start = (page - 1) * limit;
  return {
    page: rows.length ? page : 1,
    limit,
    items: rows.slice(start, start + limit),
    pagination: { page: rows.length ? page : 1, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function matchesSearch(row: Record<string, unknown>, search?: string): boolean {
  if (!search) return true;
  const term = search.trim().toLowerCase();
  return [row.customerName, row.tokenCode, row.cnic, row.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(term));
}

/** Customers who still owe at least one payable installment. */
export async function getActiveCollectionList(options: ListOptions = {}) {
  const customerMatch: Record<string, unknown> = { status: 'active' };
  if (options.location) customerMatch.location = options.location;

  const enrollments = await SchemeEnrollment.find({ status: 'active' })
    .populate({ path: 'customer', match: customerMatch })
    .lean();

  const rows = enrollments
    .filter((e) => e.customer && e.outstandingPaisa > 0)
    .map((e) => {
      const c = e.customer as unknown as Record<string, unknown>;
      return {
        enrollmentId: String(e._id),
        customerId: String(c._id),
        customerName: String(c.name ?? ''),
        cnic: String(c.cnic ?? ''),
        phone: String(c.phone ?? ''),
        location: String(c.location ?? ''),
        tokenNumber: e.tokenNumber,
        tokenCode: String(e.tokenNumber).padStart(3, '0'),
        monthlyInstallmentPaisa: e.monthlyInstallmentPaisa,
        schemeTotalPaisa: e.schemeTotalPaisa,
        totalPaidPaisa: e.totalPaidPaisa,
        outstandingPaisa: e.outstandingPaisa,
        advanceBikeActive: Boolean(c.advanceBikeActive),
        advanceCashActive: Boolean(c.advanceCashActive),
      };
    })
    .filter((r) => matchesSearch(r as unknown as Record<string, unknown>, options.search))
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstandingPaisa, 0);
  const paged = paginate(rows, options);
  return {
    items: serializeMoney(paged.items),
    pagination: paged.pagination,
    totals: { count: rows.length, outstandingPaisa: totalOutstanding },
  };
}

/** Customers with a confirmed draw closure. Full history stays available. */
export async function getDrawnClosedList(options: ListOptions = {}) {
  const customerMatch: Record<string, unknown> = { status: 'drawn_closed' };
  if (options.location) customerMatch.location = options.location;

  const customers = await Customer.find(customerMatch).lean();
  const ids = customers.map((c) => c._id);

  const [closures, enrollments] = await Promise.all([
    CustomerClosure.find({ customer: { $in: ids }, status: 'ACTIVE' })
      .populate('drawEvent', 'schemeMonth drawDate reference status')
      .lean(),
    SchemeEnrollment.find({ customer: { $in: ids } }).lean(),
  ]);

  const closureByCustomer = new Map(closures.map((c) => [String(c.customer), c]));
  const enrollmentByCustomer = new Map(enrollments.map((e) => [String(e.customer), e]));

  const rows = customers.map((c) => {
    const closure = closureByCustomer.get(String(c._id));
    const enrollment = enrollmentByCustomer.get(String(c._id));
    return {
      customerId: String(c._id),
      customerName: c.name,
      cnic: c.cnic,
      phone: c.phone,
      location: c.location,
      tokenNumber: closure?.tokenNumber ?? enrollment?.tokenNumber ?? null,
      tokenCode: String(closure?.tokenNumber ?? enrollment?.tokenNumber ?? '').padStart(3, '0'),
      closedAt: closure?.closedAt ?? null,
      stoppedFromMonth: closure?.stoppedFromMonth ?? null,
      drawMonth: (closure?.drawEvent as unknown as { schemeMonth?: number })?.schemeMonth ?? null,
      drawDate: (closure?.drawEvent as unknown as { drawDate?: Date })?.drawDate ?? null,
      totalPaidPaisa: closure?.totalPaidPaisa ?? enrollment?.totalPaidPaisa ?? 0,
      outstandingWaivedPaisa: closure?.outstandingWaivedPaisa ?? 0,
      advanceBikeActive: c.advanceBikeActive,
      advanceCashActive: c.advanceCashActive,
    };
  });

  return {
    items: serializeMoney(
      rows
        .filter((r) => matchesSearch(r as unknown as Record<string, unknown>, options.search))
        .sort((a, b) => Number(b.tokenNumber ?? 0) - Number(a.tokenNumber ?? 0))
    ),
    totals: { count: rows.length },
  };
}

/** Advance Bike register - includes customers who are still paying and those later drawn. */
export async function getAdvanceBikeList(options: ListOptions = {}) {
  return advanceList('BIKE', options);
}

/** Advance Cash register. */
export async function getAdvanceCashList(options: ListOptions = {}) {
  return advanceList('CASH', options);
}

async function advanceList(type: 'BIKE' | 'CASH', options: ListOptions) {
  const filter: Record<string, unknown> = { type };
  if (options.location) filter.location = options.location;

  const items = await CustomerAdvance.find(filter)
    .sort({ advanceDate: -1 })
    .populate('customer', 'name cnic phone location status drawStatus')
    .lean();

  const rows = items.map((a) => {
    const c = a.customer as unknown as Record<string, unknown> | undefined;
    return {
      advanceId: String(a._id),
      advanceCode: a.advanceCode,
      customerId: String(a.customer?._id ?? ''),
      customerName: String(c?.name ?? ''),
      cnic: String(c?.cnic ?? ''),
      location: a.location,
      tokenNumber: a.tokenNumber,
      tokenCode: String(a.tokenNumber).padStart(3, '0'),
      advanceDate: a.advanceDate,
      amountPaisa: a.amountPaisa,
      bikeModel: a.bikeModel,
      bikeDescription: a.bikeDescription,
      status: a.status,
      approver: a.approver,
      supportingReference: a.supportingReference,
      installmentsContinue: !a.stopsInstallments,
      customerStatus: String(c?.status ?? ''),
      laterDrawn: String(c?.drawStatus ?? '') === 'CONFIRMED',
    };
  });

  const filtered = rows.filter((r) => matchesSearch(r as unknown as Record<string, unknown>, options.search));
  return {
    items: serializeMoney(filtered),
    totals: {
      count: filtered.length,
      totalPaisa: filtered.reduce((s, r) => s + r.amountPaisa, 0),
      stillPaying: filtered.filter((r) => r.customerStatus === 'active').length,
      laterDrawn: filtered.filter((r) => r.laterDrawn).length,
    },
  };
}

/** Overdue and partially paid installments, excluding periods stopped by a closure. */
export async function getOverduePartialList(options: ListOptions = {}) {
  const installments = await Installment.find({
    status: { $in: ['overdue', 'partial'] },
    stoppedAfterDraw: { $ne: true },
  })
    .sort({ dueDate: 1, tokenNumber: 1 })
    .populate('customer', 'name cnic phone location status')
    .lean();

  const rows = installments
    .map((i) => {
      const c = i.customer as unknown as Record<string, unknown> | undefined;
      return {
        installmentId: String(i._id),
        customerId: String(i.customer?._id ?? ''),
        customerName: String(c?.name ?? ''),
        cnic: String(c?.cnic ?? ''),
        phone: String(c?.phone ?? ''),
        location: String(c?.location ?? ''),
        tokenNumber: i.tokenNumber,
        tokenCode: String(i.tokenNumber).padStart(3, '0'),
        monthNumber: i.monthNumber,
        dueDate: i.dueDate,
        scheduledPaisa: i.scheduledPaisa,
        paidPaisa: i.paidPaisa,
        outstandingPaisa: i.outstandingPaisa,
        status: i.status,
      };
    })
    .filter((r) => {
      if (options.location && r.location !== options.location) return false;
      return matchesSearch(r as unknown as Record<string, unknown>, options.search);
    });

  const paged = paginate(rows, options);
  return {
    items: serializeMoney(paged.items),
    pagination: paged.pagination,
    totals: {
      count: rows.length,
      overdue: rows.filter((r) => r.status === 'overdue').length,
      partial: rows.filter((r) => r.status === 'partial').length,
      outstandingPaisa: rows.reduce((s, r) => s + r.outstandingPaisa, 0),
    },
  };
}

export async function getLocationList(location: 'MACH' | 'QUETTA', options: Omit<ListOptions, 'location'> = {}) {
  const customers = await Customer.find({ location }).sort({ name: 1 }).lean();
  const ids = customers.map((c) => c._id);
  const enrollments = await SchemeEnrollment.find({ customer: { $in: ids } }).lean();
  const byCustomer = new Map(enrollments.map((e) => [String(e.customer), e]));

  const rows = customers
    .map((c) => {
      const e = byCustomer.get(String(c._id));
      return {
        customerId: String(c._id),
        customerCode: c.customerCode,
        customerName: c.name,
        cnic: c.cnic,
        phone: c.phone,
        location: c.location,
        joiningDate: c.joiningDate,
        status: c.status,
        drawStatus: c.drawStatus,
        tokenNumber: e?.tokenNumber ?? null,
        tokenCode: e ? String(e.tokenNumber).padStart(3, '0') : null,
        monthlyInstallmentPaisa: e?.monthlyInstallmentPaisa ?? 0,
        schemeTotalPaisa: e?.schemeTotalPaisa ?? 0,
        totalPaidPaisa: e?.totalPaidPaisa ?? 0,
        outstandingPaisa: e?.outstandingPaisa ?? 0,
      };
    })
    .filter((r) => matchesSearch(r as unknown as Record<string, unknown>, options.search));

  return {
    items: serializeMoney(rows),
    totals: {
      count: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      drawnClosed: rows.filter((r) => r.status === 'drawn_closed').length,
      schemeTotalPaisa: rows.reduce((s, r) => s + r.schemeTotalPaisa, 0),
      totalPaidPaisa: rows.reduce((s, r) => s + r.totalPaidPaisa, 0),
      outstandingPaisa: rows.reduce((s, r) => s + r.outstandingPaisa, 0),
    },
  };
}

export { getTokenRegister, getEligibleList, Types };
