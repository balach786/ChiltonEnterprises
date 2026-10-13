import { ROLES, SCHEME } from '../../constants';
import { Customer, CustomerAdvance, CustomerClosure, DrawEvent, Installment, SchemeEnrollment, Token } from '../../models';
import { confirmDraw, correctDraw, createDraw, getEligibleList, listDraws, voidDraw } from '../../services/draw.service';
import { createAdvance } from '../../services/advance.service';
import { recordPayment } from '../../services/payment.service';
import { actorFor, createTestCustomer, seedBase } from '../helpers';

describe('monthly Qurandazi and account closure', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('generates an eligible list from current customer status', async () => {
    await createTestCustomer({ tokenNumber: 1 });
    await createTestCustomer({ tokenNumber: 2, location: 'QUETTA' });

    const eligible = await getEligibleList(5);
    expect(eligible.count).toBe(2);
    expect(eligible.items.map((i) => i.tokenNumber)).toEqual([1, 2]);
  });

  it('excludes an already drawn/closed customer from the eligible list', async () => {
    const a = await createTestCustomer({ tokenNumber: 3 });
    await createTestCustomer({ tokenNumber: 4 });

    const draw = await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 3 }, actorFor(ROLES.OWNER));
    await confirmDraw(String((draw as Record<string, unknown>)._id), actorFor(ROLES.OWNER));

    const eligible = await getEligibleList(2);
    expect(eligible.items.map((i) => i.tokenNumber)).toEqual([4]);
    expect(String(a.customer._id ?? '')).toBeTruthy();
  });

  it('keeps an advance customer eligible - an advance does not close the account', async () => {
    const created = await createTestCustomer({ tokenNumber: 5 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await createAdvance(
      { customerId, type: 'BIKE', advanceDate: new Date(), amountPkr: 150000, bikeModel: 'Honda CD 70' },
      actorFor(ROLES.OWNER)
    );

    const eligible = await getEligibleList(3);
    expect(eligible.items[0].hasAdvanceBike).toBe(true);
    expect(eligible.count).toBe(1);
  });

  it('rejects an out-of-range scheme month', async () => {
    await expect(getEligibleList(29)).rejects.toMatchObject({ code: 'INVALID_SCHEME_MONTH' });
    await expect(getEligibleList(0)).rejects.toMatchObject({ code: 'INVALID_SCHEME_MONTH' });
  });

  it('saves a snapshot of the eligible list at draw time', async () => {
    await createTestCustomer({ tokenNumber: 6 });
    await createTestCustomer({ tokenNumber: 7 });

    const draw = (await createDraw({ schemeMonth: 4, drawDate: new Date(), winnerTokenNumber: 6 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    const stored = await DrawEvent.findById(draw._id).lean();
    expect(stored!.eligibleSnapshot).toHaveLength(2);
    expect(stored!.eligibleCount).toBe(2);
    expect(stored!.eligibleSnapshot.map((s) => s.tokenNumber)).toEqual([6, 7]);
    expect(stored!.status).toBe('DRAFT');
  });

  it('rejects a winner who was not in the eligible snapshot', async () => {
    await createTestCustomer({ tokenNumber: 8 });
    await expect(
      createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 99 }, actorFor(ROLES.OWNER))
    ).rejects.toMatchObject({ code: 'WINNER_NOT_ELIGIBLE' });
  });

  it('CRITICAL: confirming a draw in month 15 stops months 16-28 and closes the account', async () => {
    const created = await createTestCustomer({ tokenNumber: 9, monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    // Pay the first 15 months so there is real history to preserve.
    for (let m = 1; m <= 15; m += 1) {
      await recordPayment({ customerId, monthNumbers: [m], amountPkr: 10000 }, actorFor(ROLES.OWNER));
    }

    const draw = (await createDraw({ schemeMonth: 15, drawDate: new Date(), winnerTokenNumber: 9, reference: 'DRAW-15' }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    const installments = await Installment.find({ enrollment: created.enrollmentId }).sort({ monthNumber: 1 }).lean();
    expect(installments).toHaveLength(28);

    // Months 1-15 keep their history and paid status
    const past = installments.filter((i) => i.monthNumber <= 15);
    expect(past.every((i) => i.status === 'paid')).toBe(true);
    expect(past.reduce((s, i) => s + i.paidPaisa, 0)).toBe(15000000);

    // Months 16-28 are stopped, never unpaid or overdue
    const future = installments.filter((i) => i.monthNumber > 15);
    expect(future).toHaveLength(13);
    expect(future.every((i) => i.status === 'not_applicable')).toBe(true);
    expect(future.every((i) => i.stoppedAfterDraw)).toBe(true);
    expect(future.some((i) => i.status === 'unpaid' || i.status === 'overdue')).toBe(false);

    // Customer and enrollment are closed
    const customer = await Customer.findById(customerId).lean();
    expect(customer!.status).toBe('drawn_closed');
    expect(customer!.drawStatus).toBe('CONFIRMED');
    const enrollment = await SchemeEnrollment.findById(created.enrollmentId).lean();
    expect(enrollment!.status).toBe('drawn_closed');
    expect(enrollment!.outstandingPaisa).toBe(0);
    expect(enrollment!.totalPaidPaisa).toBe(15000000);

    // Closure record links back to the draw
    const closure = await CustomerClosure.findOne({ enrollment: created.enrollmentId }).lean();
    expect(closure!.reason).toBe('DRAW_WIN');
    expect(closure!.stoppedFromMonth).toBe(15);
    expect(closure!.status).toBe('ACTIVE');

    // Draw register is confirmed
    const stored = await DrawEvent.findById(draw._id).lean();
    expect(stored!.status).toBe('CONFIRMED');
    expect(stored!.confirmedAt).toBeTruthy();
    expect(stored!.approvedBy).toBeTruthy();

    // Past payments remain available
    const { Payment } = await import('../../models/Payment');
    expect(await Payment.countDocuments({ customer: customerId, status: 'posted' })).toBe(15);
  });

  it('frees the token for a future scheme while retaining the assignment history', async () => {
    const created = await createTestCustomer({ tokenNumber: 10 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 10 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    const token = await Token.findOne({ number: 10 }).lean();
    expect(token!.status).toBe('unassigned');
    expect(token!.history).toHaveLength(1);
    expect(token!.history[0].releasedAt).toBeTruthy();

    // The token can be reused for a new enrolment and the old history survives
    const second = await createTestCustomer({ tokenNumber: 10 });
    expect(second.enrollmentId).not.toBe(created.enrollmentId);
    const tokenAfter = await Token.findOne({ number: 10 }).lean();
    expect(tokenAfter!.status).toBe('assigned');
    expect(tokenAfter!.history).toHaveLength(2);
    expect(await SchemeEnrollment.countDocuments({ tokenNumber: 10 })).toBe(2);
    expect(String(customerId)).toBeTruthy();
  });

  it('cannot confirm the same draw twice', async () => {
    await createTestCustomer({ tokenNumber: 11 });
    const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 11 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));
    await expect(confirmDraw(String(draw._id), actorFor(ROLES.OWNER))).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' });
  });

  it('refuses confirmation without the draw:confirm permission', async () => {
    await createTestCustomer({ tokenNumber: 12 });
    const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 12 }, actorFor(ROLES.DRAW_MANAGER))) as Record<string, unknown>;
    await expect(confirmDraw(String(draw._id), actorFor(ROLES.DRAW_MANAGER))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('prevents a second confirmed draw for the same scheme month', async () => {
    await createTestCustomer({ tokenNumber: 13 });
    await createTestCustomer({ tokenNumber: 14 });
    const draw = (await createDraw({ schemeMonth: 2, drawDate: new Date(), winnerTokenNumber: 13 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    await expect(createDraw({ schemeMonth: 2, drawDate: new Date(), winnerTokenNumber: 14 }, actorFor(ROLES.OWNER))).rejects.toMatchObject({
      code: 'DRAW_ALREADY_CONFIRMED',
    });
  });

  it('corrects a finalized draw, preserving both the original and corrected values', async () => {
    const a = await createTestCustomer({ tokenNumber: 15, monthlyInstallmentPkr: 10000 });
    const b = await createTestCustomer({ tokenNumber: 16, monthlyInstallmentPkr: 10000 });
    const aId = String((a.customer as unknown as { _id: unknown })._id);
    const bId = String((b.customer as unknown as { _id: unknown })._id);

    const draw = (await createDraw({ schemeMonth: 6, drawDate: new Date(), winnerTokenNumber: 15 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    const corrected = (await correctDraw(
      String(draw._id),
      { newWinnerTokenNumber: 16, reason: 'Wrong token drawn - verified against the register' },
      actorFor(ROLES.OWNER)
    )) as Record<string, unknown>;

    expect(corrected.status).toBe('CORRECTED');
    expect(corrected.winnerTokenNumber).toBe(16);
    const corrections = corrected.corrections as Array<Record<string, unknown>>;
    expect(corrections).toHaveLength(1);
    expect((corrections[0].originalValue as Record<string, unknown>).winnerTokenNumber).toBe(15);
    expect((corrections[0].correctedValue as Record<string, unknown>).winnerTokenNumber).toBe(16);
    expect(corrections[0].reason).toMatch(/Wrong token/);

    // The first winner is re-opened with the full schedule restored
    const aCustomer = await Customer.findById(aId).lean();
    expect(aCustomer!.status).toBe('active');
    expect(aCustomer!.drawStatus).toBe('NONE');
    const aStopped = await Installment.countDocuments({ enrollment: a.enrollmentId, stoppedAfterDraw: true });
    expect(aStopped).toBe(0);
    const aClosure = await CustomerClosure.findOne({ enrollment: a.enrollmentId }).lean();
    expect(aClosure!.status).toBe('VOIDED');

    // The corrected winner is now closed from month 6
    const bCustomer = await Customer.findById(bId).lean();
    expect(bCustomer!.status).toBe('drawn_closed');
    const bStopped = await Installment.countDocuments({ enrollment: b.enrollmentId, stoppedAfterDraw: true });
    expect(bStopped).toBe(22); // months 7-28
  });

  it('requires a reason for a draw correction', async () => {
    await createTestCustomer({ tokenNumber: 17 });
    const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 17 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));
    await expect(correctDraw(String(draw._id), { newWinnerTokenNumber: 17, reason: '' }, actorFor(ROLES.OWNER))).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
  });

  it('voids a draw and restores the winner to the active collection list', async () => {
    const created = await createTestCustomer({ tokenNumber: 18 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const draw = (await createDraw({ schemeMonth: 3, drawDate: new Date(), winnerTokenNumber: 18 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    await voidDraw(String(draw._id), 'Draw conducted in error', actorFor(ROLES.OWNER));

    const customer = await Customer.findById(customerId).lean();
    expect(customer!.status).toBe('active');
    const stored = await DrawEvent.findById(draw._id).lean();
    expect(stored!.status).toBe('VOIDED');
    expect(await Installment.countDocuments({ enrollment: created.enrollmentId, stoppedAfterDraw: true })).toBe(0);
  });

  it('lists draw history by month, status and customer', async () => {
    const created = await createTestCustomer({ tokenNumber: 19 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const draw = (await createDraw({ schemeMonth: 8, drawDate: new Date(), winnerTokenNumber: 19 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    expect(await listDraws({ schemeMonth: 8 })).toHaveLength(1);
    expect(await listDraws({ schemeMonth: 9 })).toHaveLength(0);
    expect(await listDraws({ status: 'CONFIRMED' })).toHaveLength(1);
    expect(await listDraws({ status: 'DRAFT' })).toHaveLength(0);
    expect(await listDraws({ customerId })).toHaveLength(1);
    expect(await listDraws({ tokenNumber: 19 })).toHaveLength(1);
  });

  it('confirms that an advance customer who later wins has future installments stopped', async () => {
    const created = await createTestCustomer({ tokenNumber: 20, monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await createAdvance({ customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 30000, method: 'CASH' }, actorFor(ROLES.OWNER));
    expect((await Customer.findById(customerId).lean())!.advanceCashActive).toBe(true);

    const draw = (await createDraw({ schemeMonth: 10, drawDate: new Date(), winnerTokenNumber: 20 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;
    await confirmDraw(String(draw._id), actorFor(ROLES.OWNER));

    const stopped = await Installment.countDocuments({ enrollment: created.enrollmentId, stoppedAfterDraw: true });
    expect(stopped).toBe(18); // months 11-28

    // The advance history is still visible
    const advances = await CustomerAdvance.find({ customer: customerId }).lean();
    expect(advances).toHaveLength(1);
    expect(advances[0].stopsInstallments).toBe(false);

    expect(SCHEME.INSTALLMENT_MONTHS).toBe(28);
  });
});
