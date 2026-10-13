import { ClientSession, FilterQuery, Types } from 'mongoose';
import { SCHEME } from '../constants';
import { SchemeEnrollment, Token, tokenCode } from '../models';
import { ApiError } from '../utils/ApiError';
import { startOfDay } from '../utils/money';

/** Creates the 120-slot register if it does not exist yet. Idempotent. */
export async function ensureTokenRegister(session: ClientSession | null = null): Promise<number> {
  const existing = await Token.countDocuments({}).session(session ?? null);
  if (existing >= SCHEME.TOTAL_TOKEN_SLOTS) return existing;

  const missing: Array<{ number: number; code: string; status: string; history: never[] }> = [];
  const present = new Set(
    (await Token.find({}, { number: 1 }).session(session ?? null).lean()).map((t) => t.number)
  );
  for (let n = 1; n <= SCHEME.TOTAL_TOKEN_SLOTS; n += 1) {
    if (!present.has(n)) missing.push({ number: n, code: tokenCode(n), status: 'unassigned', history: [] });
  }
  if (missing.length > 0) await Token.create(missing, session ? { session, ordered: true } : {});
  return SCHEME.TOTAL_TOKEN_SLOTS;
}

export interface TokenRegisterQuery {
  status?: 'assigned' | 'unassigned';
  search?: string;
  includeHistory?: boolean;
}

/** The complete 120-token register with the current assignment joined in. */
export async function getTokenRegister(query: TokenRegisterQuery = {}) {
  await ensureTokenRegister();

  const filter: FilterQuery<unknown> = {};
  if (query.status) filter.status = query.status;

  const tokens = await Token.find(filter).sort({ number: 1 }).lean();
  const enrollmentIds = tokens.map((t) => t.currentEnrollment).filter(Boolean) as Types.ObjectId[];

  const enrollments = enrollmentIds.length
    ? await SchemeEnrollment.find({ _id: { $in: enrollmentIds } })
        .populate('customer', 'name cnic phone location status drawStatus')
        .lean()
    : [];
  const byId = new Map(enrollments.map((e) => [String(e._id), e]));

  let rows = tokens.map((t) => {
    const enrollment = t.currentEnrollment ? byId.get(String(t.currentEnrollment)) : undefined;
    const customer = enrollment?.customer as unknown as Record<string, unknown> | undefined;
    return {
      _id: String(t._id),
      number: t.number,
      code: t.code,
      status: t.status,
      assignmentHistoryCount: t.history?.length ?? 0,
      currentAssignment: enrollment
        ? {
            enrollmentId: String(enrollment._id),
            customerId: String(enrollment.customer?._id ?? ''),
            customerName: (customer?.name as string) ?? '',
            location: (customer?.location as string) ?? '',
            status: (enrollment as { status?: string }).status,
            startDate: (enrollment as { startDate?: Date }).startDate,
          }
        : null,
    };
  });

  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.code.includes(needle) ||
        String(r.number).includes(needle) ||
        (r.currentAssignment?.customerName ?? '').toLowerCase().includes(needle)
    );
  }

  return {
    total: SCHEME.TOTAL_TOKEN_SLOTS,
    assigned: rows.filter((r) => r.status === 'assigned').length,
    unassigned: rows.filter((r) => r.status === 'unassigned').length,
    items: rows,
  };
}

export interface ClaimTokenInput {
  tokenNumber: number;
  schemeCode: string;
  customer: Types.ObjectId;
  session: ClientSession | null;
}

/**
 * Atomically claims a token for a new enrolment.
 * The conditional update (`status: 'unassigned'`) plus the unique partial index on
 * active enrolments makes a double assignment impossible, even under concurrency.
 */
export async function claimToken(input: ClaimTokenInput & { enrollment: Types.ObjectId }) {
  if (input.tokenNumber < 1 || input.tokenNumber > SCHEME.TOTAL_TOKEN_SLOTS) {
    throw ApiError.badRequest(
      `Token number must be between 001 and ${SCHEME.TOTAL_TOKEN_SLOTS}`,
      'TOKEN_OUT_OF_RANGE'
    );
  }
  const opts = input.session ? { session: input.session } : {};

  const updated = await Token.findOneAndUpdate(
    { number: input.tokenNumber, status: 'unassigned' },
    {
      $set: {
        status: 'assigned',
        currentCustomer: input.customer,
        currentEnrollment: input.enrollment,
      },
      $push: {
        history: {
          enrollment: input.enrollment,
          customer: input.customer,
          assignedAt: startOfDay(new Date()),
        },
      },
    },
    { new: true, ...opts }
  ).lean();

  if (!updated) {
    const existing = await Token.findOne({ number: input.tokenNumber }).session(input.session ?? null).lean();
    throw ApiError.conflict(
      `Token ${tokenCode(input.tokenNumber)} is already assigned. Choose an unassigned token.`,
      'TOKEN_ALREADY_ASSIGNED',
      { tokenNumber: input.tokenNumber, currentEnrollment: existing?.currentEnrollment }
    );
  }
  return updated;
}

/** Releases a token so it can be reused for a future scheme, keeping its history. */
export async function releaseToken(
  tokenNumber: number,
  enrollment: Types.ObjectId,
  session: ClientSession | null
): Promise<void> {
  await Token.updateOne(
    { number: tokenNumber, currentEnrollment: enrollment },
    { $set: { status: 'unassigned' }, $unset: { currentEnrollment: '', currentCustomer: '' } },
    session ? { session } : {}
  );
  await Token.updateOne(
    { 'history.enrollment': enrollment },
    { $set: { 'history.$.releasedAt': new Date() } },
    session ? { session } : {}
  );
}

export function nextFreeTokenNumber(assigned: number[]): number | null {
  const taken = new Set(assigned);
  for (let n = 1; n <= SCHEME.TOTAL_TOKEN_SLOTS; n += 1) {
    if (!taken.has(n)) return n;
  }
  return null;
}
