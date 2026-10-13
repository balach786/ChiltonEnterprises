import { ClientSession, FilterQuery, SortOrder, Types } from 'mongoose';
import { CUSTOMER_STATUS, SCHEME } from '../constants';
import {
  AuditLog,
  Customer,
  ICustomer,
  Installment,
  maskCnic,
  nextSequence,
  normalizeCnic,
  SchemeEnrollment,
  Token,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { AuthUser } from '../types/express';
import { writeAudit } from './audit.service';
import { getSettings } from './settings.service';
import { buildSchedule, schemeTotalPaisa } from '../utils/schedule';
import { claimToken, ensureTokenRegister } from './token.service';
import { withTransaction } from '../db/mongo';

const CNIC_REGEX = /^\d{13}$/;
/** Pakistani numbers: 03xx-xxxxxxx, +92 3xx xxxxxxx, or landline 0xx-xxxxxxx. */
const PHONE_REGEX = /^(\+92|0092|92|0)?3\d{2}[- ]?\d{7}$|^(\+92|0092|92|0)?\d{2,4}[- ]?\d{6,8}$/;

export function isValidCnic(raw: string): boolean {
  return CNIC_REGEX.test(normalizeCnic(raw));
}

export function isValidPhone(raw: string): boolean {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  return PHONE_REGEX.test(String(raw ?? '').trim()) && digits.replace(/\D/g, '').length >= 10;
}

export interface CreateCustomerInput {
  name: string;
  cnic: string;
  phone: string;
  location: 'MACH' | 'QUETTA';
  joiningDate: Date;
  monthlyInstallmentPkr: number;
  tokenNumber: number;
  schemeCode?: string;
  fatherName?: string;
  address?: string;
  notes?: string;
  feesPkr?: number;
  durationMonths?: number;
  /** Set when the caller explicitly confirmed a duplicate-CNIC warning. */
  acknowledgeDuplicateCnic?: boolean;
}

export interface CreateCustomerResult {
  customer: ICustomer;
  enrollmentId: string;
  installmentCount: number;
  schemeTotalPaisa: number;
  duplicateCnicWarning?: { count: number; customerIds: string[] };
}

/**
 * Creates a customer, claims a token and generates the fixed installment schedule in one
 * transaction. Acceptance test 1-3 of the PRD depend on this path.
 */
export async function createCustomer(
  input: CreateCustomerInput,
  user: AuthUser,
  request?: { ip?: string; headers?: Record<string, unknown> }
): Promise<CreateCustomerResult> {
  if (!input.name?.trim()) throw ApiError.badRequest('Customer name is required', 'NAME_REQUIRED');
  const cnic = normalizeCnic(input.cnic);
  if (!isValidCnic(input.cnic)) {
    throw ApiError.validation('CNIC must be 13 digits', [{ field: 'cnic', message: 'Invalid CNIC format' }]);
  }
  if (!isValidPhone(input.phone)) {
    throw ApiError.validation('Phone number must be a valid Pakistani number', [
      { field: 'phone', message: 'Invalid phone number format' },
    ]);
  }
  if (!SCHEME.LOCATIONS.includes(input.location)) {
    throw ApiError.badRequest('Location must be Mach or Quetta', 'INVALID_LOCATION');
  }

  const monthlyPaisa = Math.round(Number(input.monthlyInstallmentPkr) * 100);
  if (!Number.isFinite(monthlyPaisa) || monthlyPaisa <= 0) {
    throw ApiError.badRequest('Monthly installment must be greater than zero', 'INVALID_AMOUNT');
  }

  const settings = await getSettings();
  const durationMonths = Math.round(input.durationMonths ?? SCHEME.INSTALLMENT_MONTHS);
  if (durationMonths !== SCHEME.INSTALLMENT_MONTHS) {
    throw ApiError.badRequest(
      `Scheme duration is fixed at ${SCHEME.INSTALLMENT_MONTHS} months`,
      'INVALID_DURATION'
    );
  }

  await ensureTokenRegister();

  if (!Number.isInteger(input.tokenNumber) || input.tokenNumber < 1 || input.tokenNumber > SCHEME.TOTAL_TOKEN_SLOTS) {
    throw ApiError.badRequest(
      `Token number must be between 001 and ${SCHEME.TOTAL_TOKEN_SLOTS}`,
      'TOKEN_OUT_OF_RANGE'
    );
  }

  // Duplicate CNIC policy (PRD p.6) - administrator configurable.
  let duplicateWarning: { count: number; customerIds: string[] } | undefined;
  const duplicates = await Customer.find({ cnic }).select('_id name').lean();
  if (duplicates.length > 0) {
    const ids = duplicates.map((d) => String(d._id));
    if (settings.duplicateCnicPolicy === 'block' && !input.acknowledgeDuplicateCnic) {
      throw ApiError.conflict(
        `CNIC ${maskCnic(cnic)} is already registered to another customer`,
        'DUPLICATE_CNIC',
        { existingCustomers: ids }
      );
    }
    if (settings.duplicateCnicPolicy === 'warn') duplicateWarning = { count: duplicates.length, customerIds: ids };
  }

  const result = await withTransaction(async (session) => {
    const seq = await nextSequence('customer');
    const customer = new Customer({
      customerCode: `CUST-${String(seq).padStart(5, '0')}`,
      name: input.name.trim(),
      cnic,
      cnicFormatted: formatCnicLocal(cnic),
      phone: String(input.phone).trim(),
      location: input.location,
      joiningDate: new Date(input.joiningDate),
      fatherName: input.fatherName,
      address: input.address,
      status: CUSTOMER_STATUS.ACTIVE,
      drawStatus: 'NONE',
      notes: input.notes,
      createdBy: user.id,
    });
    if (session) await customer.save({ session });
    else await customer.save();

    const token = await Token.findOne({ number: input.tokenNumber })
      .session(session ?? null)
      .lean();
    if (!token) {
      throw ApiError.badRequest(
        `Token ${String(input.tokenNumber).padStart(3, '0')} does not exist in the register`,
        'TOKEN_NOT_FOUND'
      );
    }
    if (token.status === 'assigned') {
      throw ApiError.conflict(
        `Token ${String(input.tokenNumber).padStart(3, '0')} is already assigned. Choose an unassigned token.`,
        'TOKEN_ALREADY_ASSIGNED',
        { tokenNumber: input.tokenNumber }
      );
    }

    const enrollmentSeq = await nextSequence('enrollment');
    const total = schemeTotalPaisa(monthlyPaisa, durationMonths);
    const enrollment = new SchemeEnrollment({
      enrollmentCode: `ENR-${String(enrollmentSeq).padStart(5, '0')}`,
      schemeCode: input.schemeCode ?? 'S1',
      customer: customer._id,
      token: token._id,
      tokenNumber: input.tokenNumber,
      startDate: new Date(input.joiningDate),
      monthlyInstallmentPaisa: monthlyPaisa,
      durationMonths,
      schemeTotalPaisa: total,
      feesPaisa: Math.round((input.feesPkr ?? 0) * 100),
      status: 'active',
      payableTotalPaisa: total,
      outstandingPaisa: total,
      createdBy: user.id,
    });
    try {
      if (session) await enrollment.save({ session });
      else await enrollment.save();
    } catch (err) {
      // Unique index {token, schemeCode} / unique active-token index fired first.
      if ((err as { code?: number }).code === 11000) {
        throw ApiError.conflict(
          `Token ${String(input.tokenNumber).padStart(3, '0')} is already assigned. Choose an unassigned token.`,
          'TOKEN_ALREADY_ASSIGNED',
          { tokenNumber: input.tokenNumber }
        );
      }
      throw err;
    }

    // Atomic claim - throws TOKEN_ALREADY_ASSIGNED when the token is taken.
    await claimToken({
      tokenNumber: input.tokenNumber,
      schemeCode: enrollment.schemeCode,
      customer: customer._id,
      enrollment: enrollment._id,
      session,
    });

    const schedule = buildSchedule({
      startDate: enrollment.startDate,
      monthlyInstallmentPaisa: monthlyPaisa,
      durationMonths,
      dueDayOfMonth: settings.installmentDueDayOfMonth,
    });

    const docs = schedule.map((row) => ({
      enrollment: enrollment._id,
      customer: customer._id,
      tokenNumber: enrollment.tokenNumber,
      monthNumber: row.monthNumber,
      dueDate: row.dueDate,
      scheduledPaisa: row.scheduledPaisa,
      paidPaisa: 0,
      outstandingPaisa: row.scheduledPaisa,
      adjustedPaisa: 0,
      status: 'unpaid' as const,
      stoppedAfterDraw: false,
    }));
    // Mongoose 8 requires `ordered: true` for a bulk create inside a session.
    await Installment.create(docs, session ? { session, ordered: true } : {});

    customer.currentEnrollment = enrollment._id;
    if (session) await customer.save({ session });
    else await customer.save();

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'Customer',
        entityId: String(customer._id),
        description: `Created customer ${customer.name} on token ${String(input.tokenNumber).padStart(3, '0')} with a ${durationMonths}-month schedule`,
        newValue: { tokenNumber: input.tokenNumber, monthlyPaisa, durationMonths, total },
        reason: 'New customer enrolment',
      },
      session
    );

    return {
      customer,
      enrollmentId: String(enrollment._id),
      installmentCount: docs.length,
      schemeTotalPaisa: total,
    };
  });

  return { ...result, duplicateCnicWarning: duplicateWarning };
}

function formatCnicLocal(digits: string): string {
  if (digits.length !== 13) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: 'MACH' | 'QUETTA';
  status?: string;
  drawStatus?: string;
  advanceType?: 'BIKE' | 'CASH';
  sortBy?: string;
  sortDir?: SortOrder;
  canViewCnic?: boolean;
}

export async function listCustomers(query: CustomerQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 20));

  const filter: FilterQuery<ICustomer> = {};
  if (query.location) filter.location = query.location;
  if (query.status) filter.status = query.status;
  if (query.drawStatus) filter.drawStatus = query.drawStatus;
  if (query.advanceType === 'BIKE') filter.advanceBikeActive = true;
  if (query.advanceType === 'CASH') filter.advanceCashActive = true;

  if (query.search) {
    const term = query.search.trim();
    const digits = normalizeCnic(term);
    const or: FilterQuery<ICustomer>[] = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { customerCode: { $regex: term, $options: 'i' } },
    ];
    if (digits) or.push({ cnic: { $regex: digits } });
    const asNumber = Number(term);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const enrollment = await SchemeEnrollment.findOne({ tokenNumber: asNumber }).select('customer').lean();
      if (enrollment?.customer) or.push({ _id: enrollment.customer as Types.ObjectId });
    }
    filter.$or = or;
  }

  const sortBy = query.sortBy ?? 'createdAt';
  const sortDir = query.sortDir ?? -1;
  const allowedSorts = new Set(['name', 'joiningDate', 'location', 'status', 'createdAt', 'customerCode']);
  const sortField = allowedSorts.has(sortBy) ? sortBy : 'createdAt';

  const [items, total] = await Promise.all([
    Customer.find(filter)
      .sort({ [sortField]: sortDir } as Record<string, SortOrder>)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Customer.countDocuments(filter),
  ]);

  const enrollmentIds = items.map((c) => c.currentEnrollment).filter(Boolean) as Types.ObjectId[];
  const enrollments = enrollmentIds.length
    ? await SchemeEnrollment.find({ _id: { $in: enrollmentIds } }).lean()
    : [];
  const enrollmentsByCustomer = new Map(enrollments.map((e) => [String(e.customer), e]));

  const rows = items.map((c) => {
    const e = enrollmentsByCustomer.get(String(c._id));
    const serialized = serializeMoney<Record<string, unknown>>(c) as Record<string, unknown>;
    if (!query.canViewCnic) {
      serialized.cnic = maskCnic(String(c.cnic));
      serialized.cnicFormatted = maskCnic(String(c.cnicFormatted ?? c.cnic));
    }
    return {
      ...serialized,
      tokenNumber: e?.tokenNumber ?? null,
      enrollmentId: e ? String(e._id) : null,
      monthlyInstallmentPaisa: e?.monthlyInstallmentPaisa ?? 0,
      schemeTotalPaisa: e?.schemeTotalPaisa ?? 0,
      totalPaidPaisa: e?.totalPaidPaisa ?? 0,
      outstandingPaisa: e?.outstandingPaisa ?? 0,
      schemeStatus: e?.status ?? null,
    };
  });

  return { items: rows, pagination: { page, limit, total } };
}

export async function getCustomerById(id: string, canViewCnic: boolean) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Customer');
  const customer = await Customer.findById(id).lean();
  if (!customer) throw ApiError.notFound('Customer');

  const enrollments = await SchemeEnrollment.find({ customer: customer._id })
    .sort({ createdAt: -1 })
    .lean();

  const activeEnrollment =
    enrollments.find((e) => e.status === 'active') ?? enrollments[0];

  const installmentStatus = activeEnrollment
    ? await Installment.aggregate([
        { $match: { enrollment: activeEnrollment._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
    : [];

  const serialized = serializeMoney<Record<string, unknown>>(customer) as Record<string, unknown>;
  if (!canViewCnic) {
    serialized.cnic = maskCnic(String(customer.cnic));
    serialized.cnicFormatted = maskCnic(String(customer.cnicFormatted ?? customer.cnic));
  }

  return {
    customer: serialized,
    enrollments: serializeMoney(enrollments),
    activeEnrollment: activeEnrollment ? serializeMoney(activeEnrollment) : null,
    installmentStatusCounts: installmentStatus.reduce<Record<string, number>>((acc, s) => {
      acc[String(s._id)] = s.count;
      return acc;
    }, {}),
  };
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  location?: 'MACH' | 'QUETTA';
  fatherName?: string;
  address?: string;
  notes?: string;
  status?: 'active' | 'drawn_closed' | 'inactive';
}

/**
 * Updates authorised profile fields. Financial history is never touched here; a reason is
 * recorded in the audit log whenever identity data changes (PRD p.7).
 */
export async function updateCustomer(
  id: string,
  patch: UpdateCustomerInput,
  user: AuthUser,
  reason?: string
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Customer');
  const before = await Customer.findById(id).lean();
  if (!before) throw ApiError.notFound('Customer');

  if (patch.phone && !isValidPhone(patch.phone)) {
    throw ApiError.validation('Phone number must be a valid Pakistani number');
  }
  if (patch.location && !SCHEME.LOCATIONS.includes(patch.location)) {
    throw ApiError.badRequest('Location must be Mach or Quetta', 'INVALID_LOCATION');
  }
  if (patch.status === 'active' && before.drawStatus === 'CONFIRMED') {
    throw ApiError.badRequest(
      'A drawn/closed customer cannot be reactivated without an authorised draw correction',
      'CUSTOMER_CLOSED'
    );
  }

  const updated = await Customer.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();

  await writeAudit({
    actor: user,
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: id,
    description: `Updated customer profile fields: ${Object.keys(patch).join(', ')}`,
    previousValue: Object.fromEntries(
      Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]])
    ),
    newValue: patch,
    reason: reason ?? 'Profile update',
  });

  return serializeMoney(updated);
}

/** Full customer statement: schedule, payments, receipts, draws, advances. */
export async function getCustomerStatement(id: string, canViewCnic: boolean) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Customer');
  const customer = await Customer.findById(id).lean();
  if (!customer) throw ApiError.notFound('Customer');

  const enrollments = await SchemeEnrollment.find({ customer: customer._id }).sort({ createdAt: 1 }).lean();
  const enrollmentIds = enrollments.map((e) => e._id);

  const [installments, payments, draws, advances, closures, audit] = await Promise.all([
    Installment.find({ enrollment: { $in: enrollmentIds } })
      .sort({ monthNumber: 1 })
      .lean(),
    (await import('../models/Payment')).Payment.find({ customer: customer._id })
      .sort({ paymentDate: -1 })
      .lean(),
    (await import('../models/DrawEvent')).DrawEvent.find({ winnerCustomer: customer._id }).lean(),
    (await import('../models/CustomerAdvance')).CustomerAdvance.find({ customer: customer._id }).lean(),
    (await import('../models/CustomerClosure')).CustomerClosure.find({ customer: customer._id }).lean(),
    AuditLog.find({ entityType: { $in: ['Customer', 'Payment', 'DrawEvent'] }, entityId: { $in: [id, ...enrollmentIds.map(String)] } })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const serialized = serializeMoney<Record<string, unknown>>(customer) as Record<string, unknown>;
  if (!canViewCnic) serialized.cnic = maskCnic(String(customer.cnic));

  return {
    customer: serialized,
    enrollments: serializeMoney(enrollments),
    installments: serializeMoney(installments),
    payments: serializeMoney(payments),
    draws: serializeMoney(draws),
    advances: serializeMoney(advances),
    closures: serializeMoney(closures),
    auditTrail: serializeMoney(audit),
  };
}
