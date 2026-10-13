import { ClientSession, FilterQuery, Types } from 'mongoose';
import { SCHEME } from '../constants';
import {
  Customer,
  CustomerAdvance,
  CustomerClosure,
  DrawEvent,
  IEligibleSnapshot,
  Installment,
  SchemeEnrollment,
  Token,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { AuthUser } from '../types/express';
import { withTransaction } from '../db/mongo';
import { writeAudit } from './audit.service';
import { recomputeEnrollment, stopFutureInstallments } from './installment.service';
import { claimToken, releaseToken } from './token.service';
import { deriveInstallmentStatus } from '../utils/schedule';

/**
 * Eligible list for a draw month (PRD p.8 step 2-3).
 * Eligible = active enrolment, not already drawn/closed, not cancelled.
 * Advance bike/cash customers REMAIN eligible - an advance does not close the account.
 */
export async function getEligibleList(schemeMonth: number, schemeCode = 'S1', location?: 'MACH' | 'QUETTA') {
  if (schemeMonth < 1 || schemeMonth > SCHEME.INSTALLMENT_MONTHS) {
    throw ApiError.badRequest(`Scheme month must be between 1 and ${SCHEME.INSTALLMENT_MONTHS}`, 'INVALID_SCHEME_MONTH');
  }

  const customerFilter: FilterQuery<unknown> = { status: 'active', drawStatus: { $ne: 'CONFIRMED' } };
  if (location) customerFilter.location = location;

  const enrollments = await SchemeEnrollment.find({ schemeCode, status: 'active' })
    .populate({ path: 'customer', match: customerFilter })
    .lean();

  const rows = enrollments
    .filter((e) => e.customer)
    .map((e) => {
      const c = e.customer as unknown as Record<string, unknown>;
      return {
        enrollmentId: String(e._id),
        customerId: String(e.customer?._id ?? ''),
        tokenNumber: e.tokenNumber,
        tokenCode: String(e.tokenNumber).padStart(3, '0'),
        customerName: String(c.name ?? ''),
        location: String(c.location ?? ''),
        monthlyInstallmentPaisa: e.monthlyInstallmentPaisa,
        totalPaidPaisa: e.totalPaidPaisa,
        outstandingPaisa: e.outstandingPaisa,
        hasAdvanceBike: Boolean(c.advanceBikeActive),
        hasAdvanceCash: Boolean(c.advanceCashActive),
      };
    })
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  return { schemeMonth, schemeCode, count: rows.length, items: rows };
}

async function buildSnapshot(enrollments: Array<{ enrollmentId: string; customerId: string; tokenNumber: number; customerName: string; location: 'MACH' | 'QUETTA' }>, session: null): Promise<IEligibleSnapshot[]> {
  const ids = enrollments.map((e) => new Types.ObjectId(e.enrollmentId));
  const paidAgg = await Installment.aggregate([
    { $match: { enrollment: { $in: ids } } },
    { $group: { _id: '$enrollment', paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } }, outstanding: { $sum: '$outstandingPaisa' } } },
  ]).session(session ?? null);
  const byId = new Map(paidAgg.map((p) => [String(p._id), p]));

  return enrollments.map((e) => ({
    enrollment: new Types.ObjectId(e.enrollmentId),
    customer: new Types.ObjectId(e.customerId),
    tokenNumber: e.tokenNumber,
    customerName: e.customerName,
    location: e.location,
    installmentsPaid: byId.get(e.enrollmentId)?.paid ?? 0,
    outstandingPaisa: byId.get(e.enrollmentId)?.outstanding ?? 0,
  }));
}

export interface CreateDrawInput {
  schemeMonth: number;
  drawDate: Date;
  schemeCode?: string;
  winnerTokenNumber?: number;
  reference?: string;
  witnesses?: string[];
  notes?: string;
  location?: 'MACH' | 'QUETTA';
  /** When true the draw is created already confirmed (requires draw:confirm). */
  confirm?: boolean;
}

/** Records a draw event with a snapshot of the eligible list taken at that moment. */
export async function createDraw(input: CreateDrawInput, user: AuthUser) {
  const schemeCode = input.schemeCode ?? 'S1';
  const eligible = await getEligibleList(input.schemeMonth, schemeCode, input.location);
  if (eligible.count === 0) throw ApiError.badRequest('No eligible customers for this draw month', 'NO_ELIGIBLE');

  const snapshot = await buildSnapshot(
    eligible.items.map((i) => ({
      enrollmentId: i.enrollmentId,
      customerId: i.customerId,
      tokenNumber: i.tokenNumber,
      customerName: i.customerName,
      location: i.location as 'MACH' | 'QUETTA',
    })),
    null
  );

  const existingConfirmed = await DrawEvent.findOne({
    schemeCode,
    schemeMonth: input.schemeMonth,
    status: { $in: ['CONFIRMED', 'CORRECTED'] },
  }).lean();
  if (existingConfirmed) {
    throw ApiError.conflict(
      `Scheme month ${input.schemeMonth} already has a confirmed draw. Use the correction workflow.`,
      'DRAW_ALREADY_CONFIRMED'
    );
  }

  let winner: IEligibleSnapshot | undefined;
  if (input.winnerTokenNumber) {
    winner = snapshot.find((s) => s.tokenNumber === input.winnerTokenNumber);
    if (!winner) {
      throw ApiError.badRequest(
        `Token ${input.winnerTokenNumber} is not in the eligible list for month ${input.schemeMonth}`,
        'WINNER_NOT_ELIGIBLE'
      );
    }
  }

  const draw = await DrawEvent.create({
    schemeCode,
    schemeMonth: input.schemeMonth,
    drawDate: new Date(input.drawDate),
    eligibleSnapshot: snapshot,
    eligibleCount: snapshot.length,
    winnerEnrollment: winner?.enrollment,
    winnerCustomer: winner?.customer,
    winnerTokenNumber: winner?.tokenNumber,
    winnerName: winner?.customerName,
    reference: input.reference,
    witnesses: input.witnesses ?? [],
    notes: input.notes,
    status: 'DRAFT',
    operator: user.id,
    operatorName: user.name,
  });

  await writeAudit({
    actor: user,
    action: 'CREATE',
    entityType: 'DrawEvent',
    entityId: String(draw._id),
    description: `Recorded draw for scheme month ${input.schemeMonth} with ${snapshot.length} eligible tokens`,
    newValue: { schemeMonth: input.schemeMonth, eligibleCount: snapshot.length, status: 'DRAFT' },
    reason: 'Monthly Qurandazi entry',
  });

  if (input.confirm) {
    return confirmDraw(String(draw._id), user, { skipPermissionCheck: true });
  }
  return serializeMoney(draw);
}

/**
 * Confirms a draw result. This is what closes the account and stops every future
 * installment (PRD p.8 confirmed draw rule).
 */
export async function confirmDraw(
  drawId: string,
  user: AuthUser,
  options: { skipPermissionCheck?: boolean } = {}
) {
  if (!options.skipPermissionCheck && !user.permissions.includes('draw:confirm')) {
    throw ApiError.forbidden('Only an authorised approver can confirm a draw result');
  }
  if (!Types.ObjectId.isValid(drawId)) throw ApiError.notFound('Draw');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const draw = await DrawEvent.findById(drawId).session(session ?? null).lean();
    if (!draw) throw ApiError.notFound('Draw');
    if (draw.status === 'CONFIRMED') throw ApiError.conflict('This draw is already confirmed', 'ALREADY_CONFIRMED');
    if (draw.status === 'VOIDED') throw ApiError.badRequest('A voided draw cannot be confirmed', 'DRAW_VOIDED');
    if (!draw.winnerEnrollment) throw ApiError.badRequest('Record the winning token before confirming', 'NO_WINNER');

    const enrollment = await SchemeEnrollment.findById(draw.winnerEnrollment)
      .session(session ?? null)
      .lean();
    if (!enrollment) throw ApiError.notFound('Winning enrollment');

    const existingClosure = await CustomerClosure.findOne({
      enrollment: enrollment._id,
      status: 'ACTIVE',
    })
      .session(session ?? null)
      .lean();
    if (existingClosure) {
      throw ApiError.conflict('This customer already has an active closure', 'ALREADY_CLOSED');
    }

    // 1. Stop every installment AFTER the draw month (months N+1 .. 28).
    await stopFutureInstallments({
      enrollmentId: enrollment._id,
      stoppedFromMonth: draw.schemeMonth,
      reason: `Stopped after confirmed draw in month ${draw.schemeMonth}`,
      session,
    });

    const totals = await recomputeEnrollment(enrollment._id, session, new Date());

    // 2. Create the closure record.
    const closure = new CustomerClosure({
      customer: enrollment.customer,
      enrollment: enrollment._id,
      tokenNumber: enrollment.tokenNumber,
      reason: 'DRAW_WIN',
      drawEvent: draw._id,
      stoppedFromMonth: draw.schemeMonth,
      closedAt: draw.drawDate ?? new Date(),
      totalPaidPaisa: totals.totalPaidPaisa,
      outstandingWaivedPaisa: totals.outstandingPaisa,
      finalSettlementNotes: `Won the month ${draw.schemeMonth} Qurandazi; future installments stopped.`,
      closedBy: user.id,
      closedByName: user.name,
      approvedBy: user.id,
      approvedByName: user.name,
      status: 'ACTIVE',
    });
    if (session) await closure.save({ session });
    else await closure.save();

    // 3. Update enrolment + customer status. Draw/advance statuses stay separate.
    await SchemeEnrollment.updateOne(
      { _id: enrollment._id },
      { $set: { status: 'drawn_closed', closedAt: draw.confirmedAt ?? new Date(), closure: closure._id, drawEvent: draw._id } },
      opts
    );
    await Customer.updateOne(
      { _id: enrollment.customer },
      { $set: { status: 'drawn_closed', drawStatus: 'CONFIRMED' } },
      opts
    );

    // 4. Free the token for a future scheme while retaining the assignment history.
    await releaseToken(enrollment.tokenNumber, enrollment._id, session);

    await DrawEvent.updateOne(
      { _id: draw._id },
      {
        $set: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          approvedBy: user.id,
          approvedByName: user.name,
          closure: closure._id,
        },
      },
      opts
    );

    await writeAudit(
      {
        actor: user,
        action: 'CONFIRM',
        entityType: 'DrawEvent',
        entityId: String(draw._id),
        description: `Confirmed month ${draw.schemeMonth} draw - winner token ${String(draw.winnerTokenNumber).padStart(3, '0')}; future installments stopped`,
        previousValue: { status: draw.status },
        newValue: { status: 'CONFIRMED', closureId: String(closure._id), stoppedFromMonth: draw.schemeMonth },
        reason: 'Draw confirmation and account closure',
      },
      session
    );

    const stopped = await Installment.countDocuments({
      enrollment: enrollment._id,
      stoppedAfterDraw: true,
    }).session(session ?? null);

    return { draw: serializeMoney(draw), closure: serializeMoney(closure), stoppedInstallments: stopped, totals };
  });
}

/**
 * Authorised correction of a finalized draw (PRD p.9). The original value is preserved
 * inside the corrections array - nothing is silently overwritten.
 */
export async function correctDraw(
  drawId: string,
  input: { newWinnerTokenNumber?: number; drawDate?: Date; reference?: string; notes?: string; reason: string },
  user: AuthUser
) {
  if (!input.reason?.trim()) throw ApiError.badRequest('A reason is required to correct a draw', 'REASON_REQUIRED');
  if (!Types.ObjectId.isValid(drawId)) throw ApiError.notFound('Draw');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const draw = await DrawEvent.findById(drawId).session(session ?? null).lean();
    if (!draw) throw ApiError.notFound('Draw');
    if (draw.status === 'DRAFT') {
      throw ApiError.badRequest('Draft draws can be edited directly - corrections apply to finalized results', 'DRAW_IS_DRAFT');
    }

    const originalValue = {
      winnerTokenNumber: draw.winnerTokenNumber,
      winnerName: draw.winnerName,
      winnerEnrollment: draw.winnerEnrollment,
      drawDate: draw.drawDate,
      reference: draw.reference,
      status: draw.status,
    };

    const patch: Record<string, unknown> = {};
    if (input.drawDate) patch.drawDate = new Date(input.drawDate);
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.notes !== undefined) patch.notes = input.notes;

    let newWinner: IEligibleSnapshot | undefined;
    if (input.newWinnerTokenNumber) {
      newWinner = draw.eligibleSnapshot.find((s) => s.tokenNumber === input.newWinnerTokenNumber);
      if (!newWinner) {
        throw ApiError.badRequest(
          `Token ${input.newWinnerTokenNumber} was not in the eligible list saved for this draw`,
          'WINNER_NOT_ELIGIBLE'
        );
      }

      // --- re-open the previous winner if it changed -------------------------------
      if (draw.winnerEnrollment && String(draw.winnerEnrollment) !== String(newWinner.enrollment)) {
        await reopenEnrollment(draw.winnerEnrollment, draw.schemeMonth, input.reason, user, session);
      }

      patch.winnerEnrollment = newWinner.enrollment;
      patch.winnerCustomer = newWinner.customer;
      patch.winnerTokenNumber = newWinner.tokenNumber;
      patch.winnerName = newWinner.customerName;

      // --- close the new winner -----------------------------------------------------
      const enrollment = await SchemeEnrollment.findById(newWinner.enrollment)
        .session(session ?? null)
        .lean();
      if (enrollment && enrollment.status !== 'drawn_closed') {
        await stopFutureInstallments({
          enrollmentId: enrollment._id,
          stoppedFromMonth: draw.schemeMonth,
          reason: `Stopped after corrected draw in month ${draw.schemeMonth}`,
          session,
        });
        const totals = await recomputeEnrollment(enrollment._id, session, new Date());
        const closure = new CustomerClosure({
          customer: enrollment.customer,
          enrollment: enrollment._id,
          tokenNumber: enrollment.tokenNumber,
          reason: 'DRAW_WIN',
          drawEvent: draw._id,
          stoppedFromMonth: draw.schemeMonth,
          closedAt: new Date(),
          totalPaidPaisa: totals.totalPaidPaisa,
          outstandingWaivedPaisa: totals.outstandingPaisa,
          finalSettlementNotes: `Closure created by authorised draw correction: ${input.reason}`,
          closedBy: user.id,
          closedByName: user.name,
          approvedBy: user.id,
          approvedByName: user.name,
          status: 'ACTIVE',
        });
        if (session) await closure.save({ session });
        else await closure.save();

        await SchemeEnrollment.updateOne(
          { _id: enrollment._id },
          { $set: { status: 'drawn_closed', closedAt: new Date(), closure: closure._id, drawEvent: draw._id } },
          opts
        );
        await Customer.updateOne(
          { _id: enrollment.customer },
          { $set: { status: 'drawn_closed', drawStatus: 'CONFIRMED' } },
          opts
        );
        await releaseToken(enrollment.tokenNumber, enrollment._id, session);
        patch.closure = closure._id;
      }
    }

    patch.status = 'CORRECTED';
    patch.$push = {
      corrections: {
        correctedAt: new Date(),
        correctedBy: user.id,
        correctedByName: user.name,
        reason: input.reason,
        originalValue,
        correctedValue: {
          winnerTokenNumber: patch.winnerTokenNumber ?? draw.winnerTokenNumber,
          winnerName: patch.winnerName ?? draw.winnerName,
          drawDate: patch.drawDate ?? draw.drawDate,
          reference: patch.reference ?? draw.reference,
        },
      },
    };

    const { $push, ...setPatch } = patch;
    const updated = await DrawEvent.findByIdAndUpdate(
      drawId,
      { $set: setPatch, $push: $push as never },
      { new: true, ...opts }
    ).lean();

    await writeAudit(
      {
        actor: user,
        action: 'CORRECTION',
        entityType: 'DrawEvent',
        entityId: String(draw._id),
        description: `Corrected draw result for scheme month ${draw.schemeMonth}`,
        previousValue: originalValue,
        newValue: { winnerTokenNumber: patch.winnerTokenNumber ?? draw.winnerTokenNumber },
        reason: input.reason,
      },
      session
    );

    return serializeMoney(updated);
  });
}

/** Voids a draw and re-opens the winner's account (used when a draw was recorded in error). */
export async function voidDraw(drawId: string, reason: string, user: AuthUser) {
  if (!reason?.trim()) throw ApiError.badRequest('A reason is required to void a draw', 'REASON_REQUIRED');
  if (!Types.ObjectId.isValid(drawId)) throw ApiError.notFound('Draw');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const draw = await DrawEvent.findById(drawId).session(session ?? null).lean();
    if (!draw) throw ApiError.notFound('Draw');
    if (draw.winnerEnrollment) {
      await reopenEnrollment(draw.winnerEnrollment, draw.schemeMonth, reason, user, session);
    }
    const updated = await DrawEvent.findByIdAndUpdate(
      drawId,
      {
        $set: { status: 'VOIDED', notes: `${draw.notes ?? ''}\n[voided] ${reason}`.trim() },
        $push: {
          corrections: {
            correctedAt: new Date(),
            correctedBy: user.id,
            correctedByName: user.name,
            reason,
            originalValue: { status: draw.status },
            correctedValue: { status: 'VOIDED' },
          },
        },
      },
      { new: true, ...opts }
    ).lean();

    await writeAudit({
      actor: user,
      action: 'CORRECTION',
      entityType: 'DrawEvent',
      entityId: String(draw._id),
      description: `Voided draw for scheme month ${draw.schemeMonth}`,
      previousValue: { status: draw.status },
      newValue: { status: 'VOIDED' },
      reason,
    });

    return serializeMoney(updated);
  });
}

/**
 * Re-opens an enrolment that was closed by a draw: the closure is voided (not deleted),
 * the stopped installments are re-derived from their real balances, and the customer is
 * returned to the active collection list. Past payments are untouched.
 */
async function reopenEnrollment(
  enrollmentId: Types.ObjectId,
  schemeMonth: number,
  reason: string,
  user: AuthUser,
  session: ClientSession | null
) {
  const opts = session ? { session } : {};
  const enrollment = await SchemeEnrollment.findById(enrollmentId).session(session ?? null).lean();
  if (!enrollment) return;

  await Installment.updateMany(
    { enrollment: enrollmentId, stoppedAfterDraw: true },
    { $set: { stoppedAfterDraw: false, notApplicableReason: undefined } },
    opts
  );

  const installments = await Installment.find({ enrollment: enrollmentId }).session(session ?? null).lean();
  for (const inst of installments) {
    const status = deriveInstallmentStatus({
      scheduledPaisa: inst.scheduledPaisa,
      paidPaisa: inst.paidPaisa,
      adjustedPaisa: inst.adjustedPaisa,
      dueDate: inst.dueDate,
      stoppedAfterDraw: false,
    });
    await Installment.updateOne(
      { _id: inst._id },
      {
        $set: {
          status,
          outstandingPaisa: Math.max(0, inst.scheduledPaisa - inst.paidPaisa - inst.adjustedPaisa),
        },
      },
      opts
    );
  }

  await CustomerClosure.updateMany(
    { enrollment: enrollmentId, status: 'ACTIVE' },
    { $set: { status: 'VOIDED', voidedAt: new Date(), voidedReason: reason } },
    opts
  );
  await SchemeEnrollment.updateOne(
    { _id: enrollmentId },
    { $set: { status: 'active', closedAt: undefined, closure: undefined } },
    opts
  );
  await Customer.updateOne(
    { _id: enrollment.customer },
    { $set: { status: 'active', drawStatus: 'NONE' } },
    opts
  );

  // Re-claim the token if it is currently free.
  const token = await Token.findOne({ number: enrollment.tokenNumber }).session(session ?? null).lean();
  if (token && token.status === 'unassigned') {
    await claimToken({
      tokenNumber: enrollment.tokenNumber,
      schemeCode: enrollment.schemeCode,
      customer: enrollment.customer,
      enrollment: enrollment._id,
      session,
    });
  }

  await recomputeEnrollment(enrollmentId, session, new Date());

  await writeAudit({
    actor: user,
    action: 'CORRECTION',
    entityType: 'CustomerClosure',
    entityId: String(enrollment.customer),
    description: `Re-opened account after draw correction (scheme month ${schemeMonth})`,
    reason,
  });
}

export interface DrawQuery {
  schemeMonth?: number;
  location?: 'MACH' | 'QUETTA';
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tokenNumber?: number;
  customerId?: string;
}

export async function listDraws(query: DrawQuery) {
  const filter: FilterQuery<unknown> = {};
  if (query.schemeMonth) filter.schemeMonth = query.schemeMonth;
  if (query.status) filter.status = query.status;
  if (query.tokenNumber) filter.winnerTokenNumber = query.tokenNumber;
  if (query.customerId) filter.winnerCustomer = new Types.ObjectId(query.customerId);
  if (query.location) filter['eligibleSnapshot.location'] = query.location;
  if (query.dateFrom || query.dateTo) {
    filter.drawDate = {};
    if (query.dateFrom) filter.drawDate.$gte = query.dateFrom;
    if (query.dateTo) filter.drawDate.$lte = query.dateTo;
  }

  const draws = await DrawEvent.find(filter).sort({ schemeMonth: 1, drawDate: -1 }).lean();
  return draws.map((d) => ({
    ...serializeMoney<Record<string, unknown>>(d),
    tokenCode: d.winnerTokenNumber ? String(d.winnerTokenNumber).padStart(3, '0') : null,
  }));
}

export async function getDrawById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Draw');
  const draw = await DrawEvent.findById(id).lean();
  if (!draw) throw ApiError.notFound('Draw');
  const closure = draw.closure ? await CustomerClosure.findById(draw.closure).lean() : null;
  const advance = draw.winnerCustomer
    ? await CustomerAdvance.find({ customer: draw.winnerCustomer }).lean()
    : [];
  return { draw: serializeMoney(draw), closure: serializeMoney(closure), advances: serializeMoney(advance) };
}
