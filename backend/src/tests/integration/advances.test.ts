import { ROLES } from '../../constants';
import { CashMovement, Customer, CustomerAdvance, ExpenseTransaction, Installment, SchemeEnrollment } from '../../models';
import { createAdvance, listAdvances, updateAdvance } from '../../services/advance.service';
import { getActiveCollectionList, getAdvanceBikeList, getAdvanceCashList } from '../../services/list.service';
import { actorFor, createTestCustomer, seedBase } from '../helpers';

describe('advance bike and advance cash', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('CRITICAL: an Advance Bike does not stop installments', async () => {
    const created = await createTestCustomer({ tokenNumber: 31, monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await createAdvance(
      {
        customerId,
        type: 'BIKE',
        advanceDate: new Date(),
        amountPkr: 185000,
        bikeModel: 'Honda CD 70',
        bikeDescription: 'Red, new, 2024',
        approver: 'Owner',
        authorizedBy: 'Owner',
        supportingReference: 'CHQ-1234',
      },
      actorFor(ROLES.OWNER)
    );

    expect(result.advance.stopsInstallments).toBe(false);
    expect(result.payableInstallmentsRemaining).toBe(28);

    const installments = await Installment.find({ enrollment: created.enrollmentId }).lean();
    expect(installments.filter((i) => i.stoppedAfterDraw)).toHaveLength(0);
    expect(installments.filter((i) => i.status === 'unpaid')).toHaveLength(28);

    // Still on the active collection list
    const active = await getActiveCollectionList();
    expect(active.items.map((i: unknown) => (i as Record<string, unknown>).tokenNumber)).toContain(31);

    // Appears on the Advance Bike list
    const bikes = await getAdvanceBikeList();
    expect(bikes.items).toHaveLength(1);
    expect((bikes.items[0] as Record<string, unknown>).installmentsContinue).toBe(true);
  });

  it('records an Advance Bike without creating any cash movement', async () => {
    const created = await createTestCustomer({ tokenNumber: 32 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await createAdvance(
      { customerId, type: 'BIKE', advanceDate: new Date(), amountPkr: 200000, bikeModel: 'Suzuki GS150' },
      actorFor(ROLES.OWNER)
    );

    expect(await CashMovement.countDocuments({})).toBe(0);
    expect(await ExpenseTransaction.countDocuments({})).toBe(0);
    expect((await Customer.findById(customerId).lean())!.advanceBikeActive).toBe(true);
  });

  it('requires bike details for an Advance Bike', async () => {
    const created = await createTestCustomer({ tokenNumber: 33 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await expect(
      createAdvance({ customerId, type: 'BIKE', advanceDate: new Date(), amountPkr: 100000 }, actorFor(ROLES.OWNER))
    ).rejects.toMatchObject({ code: 'BIKE_DETAILS_REQUIRED' });
  });

  it('records Advance Cash as exactly one expense and one cash outflow, linked to the case', async () => {
    const created = await createTestCustomer({ tokenNumber: 34, monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await createAdvance(
      { customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 45000, method: 'CASH', purpose: 'Emergency advance' },
      actorFor(ROLES.OWNER)
    );
    const advanceId = String((result.advance as Record<string, unknown>)._id);

    const expenses = await ExpenseTransaction.find({ sourceRef: advanceId }).lean();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe('CUSTOMER_ADVANCE_CASH');
    // Customer advances are cash outflows but NOT operating expenses.
    expect(expenses[0].isOperatingExpense).toBe(false);

    const movements = await CashMovement.find({ sourceRef: advanceId }).lean();
    expect(movements).toHaveLength(1);
    expect(movements[0].direction).toBe('OUT');
    expect(movements[0].amountPaisa).toBe(4500000);

    // The cash balance went down once
    const { FinancialAccount } = await import('../../models/FinancialAccount');
    const cash = await FinancialAccount.findOne({ type: 'CASH' }).lean();
    expect(cash!.balancePaisa).toBe(-4500000);

    // Installments continue
    const stillOwed = await Installment.countDocuments({ enrollment: created.enrollmentId, status: 'unpaid' });
    expect(stillOwed).toBe(28);
    expect((await Customer.findById(customerId).lean())!.advanceCashActive).toBe(true);
  });

  it('refuses to record the same advance cash twice (no duplicate cash movement)', async () => {
    const created = await createTestCustomer({ tokenNumber: 35 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const first = await createAdvance({ customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 20000 }, actorFor(ROLES.OWNER));
    const advanceId = String((first.advance as Record<string, unknown>)._id);

    // Attempting a second expense/cash movement from the same advance is rejected.
    const { recordMovement } = await import('../../services/cashMovement.service');
    const { FinancialAccount } = await import('../../models/FinancialAccount');
    const cash = await FinancialAccount.findOne({ type: 'CASH' }).lean();
    await expect(
      recordMovement(
        {
          account: cash!._id,
          direction: 'OUT',
          amountPaisa: 2000000,
          movementDate: new Date(),
          sourceType: 'ADVANCE_CASH',
          sourceRef: advanceId,
        },
        null
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_MOVEMENT' });

    expect(await CashMovement.countDocuments({ sourceRef: advanceId })).toBe(1);
  });

  it('keeps the advance customer on the active collection list', async () => {
    const created = await createTestCustomer({ tokenNumber: 36, monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await createAdvance({ customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 10000 }, actorFor(ROLES.OWNER));

    const active = await getActiveCollectionList();
    const row = active.items.find((i: unknown) => (i as Record<string, unknown>).tokenNumber === 36) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.advanceCashActive).toBe(true);
    expect(Number(row.outstandingPaisa)).toBe(28000000);
  });

  it('separates the Advance Bike and Advance Cash registers', async () => {
    const a = await createTestCustomer({ tokenNumber: 37 });
    const b = await createTestCustomer({ tokenNumber: 38 });
    await createAdvance(
      { customerId: String((a.customer as unknown as { _id: unknown })._id), type: 'BIKE', advanceDate: new Date(), amountPkr: 100000, bikeModel: 'YBR 125' },
      actorFor(ROLES.OWNER)
    );
    await createAdvance(
      { customerId: String((b.customer as unknown as { _id: unknown })._id), type: 'CASH', advanceDate: new Date(), amountPkr: 25000 },
      actorFor(ROLES.OWNER)
    );

    expect((await getAdvanceBikeList()).items).toHaveLength(1);
    expect((await getAdvanceCashList()).items).toHaveLength(1);
    expect((await listAdvances({})).items).toHaveLength(2);
    expect((await listAdvances({ type: 'CASH' })).totals.totalPaisa).toBe(2500000);
  });

  it('updates advance status and clears the customer flag when the last case settles', async () => {
    const created = await createTestCustomer({ tokenNumber: 39 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const result = await createAdvance(
      { customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 15000 },
      actorFor(ROLES.OWNER)
    );
    const advanceId = String((result.advance as Record<string, unknown>)._id);

    await updateAdvance(advanceId, { status: 'SETTLED', settlementNotes: 'Recovered from installments', reason: 'Settled' }, actorFor(ROLES.OWNER));

    expect((await CustomerAdvance.findById(advanceId).lean())!.status).toBe('SETTLED');
    expect((await Customer.findById(customerId).lean())!.advanceCashActive).toBe(false);
  });

  it('reports advance cases split by location', async () => {
    const a = await createTestCustomer({ tokenNumber: 40, location: 'MACH' });
    const b = await createTestCustomer({ tokenNumber: 41, location: 'QUETTA' });
    const ids = [String((a.customer as unknown as { _id: unknown })._id), String((b.customer as unknown as { _id: unknown })._id)];
    for (const id of ids) {
      await createAdvance({ customerId: id, type: 'CASH', advanceDate: new Date(), amountPkr: 10000 }, actorFor(ROLES.OWNER));
    }

    expect((await listAdvances({ location: 'MACH' })).items).toHaveLength(1);
    expect((await listAdvances({ location: 'QUETTA' })).items).toHaveLength(1);
  });

  it('validates the advance amount', async () => {
    const created = await createTestCustomer({ tokenNumber: 43 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await expect(
      createAdvance({ customerId, type: 'CASH', advanceDate: new Date(), amountPkr: 0 }, actorFor(ROLES.OWNER))
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      createAdvance({ customerId, type: 'CASH', advanceDate: new Date(), amountPkr: -500 }, actorFor(ROLES.OWNER))
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('records the advance in the audit trail with the continue rule', async () => {
    const { AuditLog } = await import('../../models/AuditLog');
    const created = await createTestCustomer({ tokenNumber: 44 });
    await createAdvance(
      { customerId: String((created.customer as unknown as { _id: unknown })._id), type: 'CASH', advanceDate: new Date(), amountPkr: 5000 },
      actorFor(ROLES.OWNER)
    );
    const logs = await AuditLog.find({ entityType: 'CustomerAdvance' }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].description).toMatch(/installments continue/);
    expect((logs[0].newValue as Record<string, unknown>).stopsInstallments).toBe(false);
  });

  it('keeps the enrollment outstanding balance untouched by an advance', async () => {
    const created = await createTestCustomer({ tokenNumber: 45, monthlyInstallmentPkr: 8000 });
    await createAdvance(
      { customerId: String((created.customer as unknown as { _id: unknown })._id), type: 'CASH', advanceDate: new Date(), amountPkr: 30000 },
      actorFor(ROLES.OWNER)
    );
    const enrollment = await SchemeEnrollment.findById(created.enrollmentId).lean();
    expect(enrollment!.outstandingPaisa).toBe(8000 * 100 * 28);
  });
});
