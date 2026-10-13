import { ROLES } from '../../constants';
import { CashMovement, FinancialAccount, IncomeTransaction, Installment, Payment, Receipt, SchemeEnrollment } from '../../models';
import { allocateCredit, getCustomerCreditPaisa, recordPayment, reversePayment } from '../../services/payment.service';
import { actorFor, createTestCustomer, seedBase } from '../helpers';

describe('installments and payments', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('records a payment and updates the receipt, installment balance and cash ledger consistently', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await recordPayment(
      { customerId, monthNumbers: [1], amountPkr: 10000, method: 'CASH' },
      actorFor(ROLES.OWNER)
    );

    const payment = result.payment as Record<string, unknown>;
    expect(Number(payment.amountPaisa)).toBe(1000000);
    expect(Number(payment.allocatedPaisa)).toBe(1000000);
    expect(Number(payment.unallocatedPaisa)).toBe(0);

    // Receipt
    const receipt = await Receipt.findOne({ payment: payment._id }).lean();
    expect(receipt).toBeTruthy();
    expect(receipt!.number).toMatch(/^RCPT-\d{4}-\d+$/);
    expect(receipt!.amountPaisa).toBe(1000000);

    // Installment ledger
    const installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(installment!.paidPaisa).toBe(1000000);
    expect(installment!.outstandingPaisa).toBe(0);
    expect(installment!.status).toBe('paid');

    // Enrollment totals
    const enrollment = await SchemeEnrollment.findById(created.enrollmentId).lean();
    expect(enrollment!.totalPaidPaisa).toBe(1000000);
    expect(enrollment!.outstandingPaisa).toBe(28000000 - 1000000);

    // Cash ledger: exactly one movement, balance increased
    const movements = await CashMovement.find({ sourceRef: payment._id }).lean();
    expect(movements).toHaveLength(1);
    expect(movements[0].direction).toBe('IN');
    expect(movements[0].amountPaisa).toBe(1000000);
    const cash = await FinancialAccount.findOne({ type: 'CASH' }).lean();
    expect(cash!.balancePaisa).toBe(1000000);

    // Income mirror is linked, never a second independent entry
    const incomes = await IncomeTransaction.find({ sourceRef: payment._id }).lean();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].sourceType).toBe('CUSTOMER_PAYMENT');
    expect(incomes[0].isRevenue).toBe(true);
  });

  it('leaves an installment Partial until the full scheduled amount is paid', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await recordPayment({ customerId, monthNumbers: [1], amountPkr: 4000 }, actorFor(ROLES.OWNER));
    let installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(installment!.status).toBe('partial');
    expect(installment!.outstandingPaisa).toBe(600000);

    await recordPayment({ customerId, monthNumbers: [1], amountPkr: 6000 }, actorFor(ROLES.OWNER));
    installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(installment!.status).toBe('paid');
    expect(installment!.outstandingPaisa).toBe(0);

    // Two payment records must be retained
    expect(await Payment.countDocuments({ enrollment: created.enrollmentId, status: 'posted' })).toBe(2);
  });

  it('pays several months in one transaction when they are explicitly selected', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 5000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await recordPayment({ customerId, monthNumbers: [1, 2, 3], amountPkr: 15000 }, actorFor(ROLES.OWNER));
    expect(result.allocations.map((a) => a.monthNumber)).toEqual([1, 2, 3]);

    const paid = await Installment.find({ enrollment: created.enrollmentId, status: 'paid' }).lean();
    expect(paid.map((i) => i.monthNumber).sort()).toEqual([1, 2, 3]);
  });

  it('holds an overpayment as an unallocated customer credit instead of spilling into another month', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await recordPayment(
      { customerId, monthNumbers: [1], amountPkr: 13000, allowCredit: true },
      actorFor(ROLES.OWNER)
    );

    expect(result.unallocatedPaisa).toBe(300000);

    const month1 = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    const month2 = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 2 }).lean();
    expect(month1!.paidPaisa).toBe(1000000);
    expect(month2!.paidPaisa).toBe(0); // never silently allocated
    expect(month2!.status).toBe('unpaid');

    expect(await getCustomerCreditPaisa(customerId)).toBe(300000);
  });

  it('rejects an overpayment unless the caller explicitly allows a credit', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await expect(
      recordPayment({ customerId, monthNumbers: [1, 2], amountPkr: 25000 }, actorFor(ROLES.OWNER))
    ).rejects.toMatchObject({ code: 'NOTHING_ALLOCATED' });
  });

  it('requires an explicit installment selection when auto allocation is off', async () => {
    const created = await createTestCustomer();
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await expect(recordPayment({ customerId, amountPkr: 10000 }, actorFor(ROLES.OWNER))).rejects.toMatchObject({
      code: 'NO_INSTALLMENT_SELECTED',
    });
  });

  it('auto-allocates to the oldest outstanding installments', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 5000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await recordPayment({ customerId, autoAllocate: true, amountPkr: 10000 }, actorFor(ROLES.OWNER));
    const paid = await Installment.find({ enrollment: created.enrollmentId, status: 'paid' }).lean();
    expect(paid.map((i) => i.monthNumber).sort()).toEqual([1, 2]);
  });

  it('generates a unique receipt number for every payment', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 1000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    for (let month = 1; month <= 5; month += 1) {
      await recordPayment({ customerId, monthNumbers: [month], amountPkr: 1000 }, actorFor(ROLES.OWNER));
    }
    const receipts = await Receipt.find({}).lean();
    expect(receipts).toHaveLength(5);
    expect(new Set(receipts.map((r) => r.number)).size).toBe(5);
  });

  it('explicitly allocates a held credit without creating a second cash movement', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await recordPayment({ customerId, monthNumbers: [1], amountPkr: 20000, allowCredit: true }, actorFor(ROLES.OWNER));
    expect(await getCustomerCreditPaisa(customerId)).toBe(1000000);

    const movementsBefore = await CashMovement.countDocuments({});
    await allocateCredit({ customerId, monthNumbers: [2], amountPkr: 10000 }, actorFor(ROLES.OWNER));

    expect(await getCustomerCreditPaisa(customerId)).toBe(0);
    const month2 = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 2 }).lean();
    expect(month2!.paidPaisa).toBe(1000000);
    expect(month2!.status).toBe('paid');
    // No new cash movement - the money entered the ledger when it was received.
    expect(await CashMovement.countDocuments({})).toBe(movementsBefore);
  });

  it('refuses to allocate more credit than is held', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await recordPayment({ customerId, monthNumbers: [1], amountPkr: 11000, allowCredit: true }, actorFor(ROLES.OWNER));

    await expect(allocateCredit({ customerId, monthNumbers: [2], amountPkr: 5000 }, actorFor(ROLES.OWNER))).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDIT',
    });
  });

  it('rejects a zero or negative payment amount', async () => {
    const created = await createTestCustomer();
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    await expect(recordPayment({ customerId, monthNumbers: [1], amountPkr: 0 }, actorFor(ROLES.OWNER))).rejects.toThrow();
    await expect(recordPayment({ customerId, monthNumbers: [1], amountPkr: -100 }, actorFor(ROLES.OWNER))).rejects.toThrow();
  });

  it('reverses a payment, keeps the original history and recalculates balances', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const result = await recordPayment({ customerId, monthNumbers: [1], amountPkr: 10000 }, actorFor(ROLES.OWNER));
    const originalId = String((result.payment as Record<string, unknown>)._id);
    const cashBefore = (await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa;

    await reversePayment(originalId, 'Entered against the wrong month', actorFor(ROLES.OWNER));

    const original = await Payment.findById(originalId).lean();
    expect(original!.status).toBe('reversed');
    expect(original!.reversalReason).toBe('Entered against the wrong month');
    expect(original!.reversedByPayment).toBeTruthy();

    const reversal = await Payment.findById(original!.reversedByPayment).lean();
    expect(reversal!.amountPaisa).toBe(-1000000);
    expect(reversal!.sourceType).toBe('REVERSAL');

    const installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(installment!.paidPaisa).toBe(0);
    expect(installment!.status).toBe('unpaid');

    const cashAfter = (await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa;
    expect(cashAfter).toBe(cashBefore - 1000000);

    const receipt = await Receipt.findOne({ payment: originalId }).lean();
    expect(receipt!.status).toBe('cancelled');

    // Both records remain queryable
    expect(await Payment.countDocuments({})).toBe(2);
  });

  it('cannot reverse the same payment twice', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const result = await recordPayment({ customerId, monthNumbers: [1], amountPkr: 10000 }, actorFor(ROLES.OWNER));
    const id = String((result.payment as Record<string, unknown>)._id);

    await reversePayment(id, 'first reversal', actorFor(ROLES.OWNER));
    await expect(reversePayment(id, 'second reversal', actorFor(ROLES.OWNER))).rejects.toMatchObject({
      code: 'ALREADY_REVERSED',
    });
  });

  it('requires a reason before a payment can be reversed', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const result = await recordPayment({ customerId, monthNumbers: [1], amountPkr: 10000 }, actorFor(ROLES.OWNER));
    const id = String((result.payment as Record<string, unknown>)._id);

    await expect(reversePayment(id, '', actorFor(ROLES.OWNER))).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('writes an audit record for a payment and for its reversal', async () => {
    const { AuditLog } = await import('../../models/AuditLog');
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);
    const result = await recordPayment({ customerId, monthNumbers: [1], amountPkr: 10000 }, actorFor(ROLES.OWNER));
    const id = String((result.payment as Record<string, unknown>)._id);
    await reversePayment(id, 'Correction requested by the customer', actorFor(ROLES.OWNER));

    const logs = await AuditLog.find({ entityType: 'Payment' }).lean();
    expect(logs.some((l) => l.action === 'CREATE')).toBe(true);
    expect(logs.some((l) => l.action === 'REVERSAL')).toBe(true);
  });

  it('is idempotent when the same idempotency key is replayed', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const first = await recordPayment(
      { customerId, monthNumbers: [1], amountPkr: 10000, idempotencyKey: 'key-1' },
      actorFor(ROLES.OWNER)
    );
    const second = await recordPayment(
      { customerId, monthNumbers: [1], amountPkr: 10000, idempotencyKey: 'key-1' },
      actorFor(ROLES.OWNER)
    );

    expect(String((second.payment as Record<string, unknown>)._id)).toBe(String((first.payment as Record<string, unknown>)._id));
    expect(await Payment.countDocuments({})).toBe(1);
    expect(await CashMovement.countDocuments({})).toBe(1);
  });

  it('applies an authorised adjustment/waiver to an installment', async () => {
    const { adjustInstallment } = await import('../../services/installment.service');
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();

    await adjustInstallment({ installmentId: String(installment!._id), adjustedPkr: 2000, reason: 'Approved waiver', user: actorFor(ROLES.OWNER) });

    const after = await Installment.findById(installment!._id).lean();
    expect(after!.adjustedPaisa).toBe(200000);
    expect(after!.adjustmentReason).toBe('Approved waiver');
    expect(after!.outstandingPaisa).toBe(800000);
    expect(after!.status).toBe('partial'); // a partial waiver keeps the balance visible

    const enrollment = await SchemeEnrollment.findById(created.enrollmentId).lean();
    expect(enrollment!.outstandingPaisa).toBe(28000000 - 200000);

    // A full waiver settles the period and is labelled Adjusted.
    const inst2 = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 2 }).lean();
    await adjustInstallment({ installmentId: String(inst2!._id), adjustedPkr: 10000, reason: 'Full waiver approved', user: actorFor(ROLES.OWNER) });
    const after2 = await Installment.findById(inst2!._id).lean();
    expect(after2!.status).toBe('adjusted');
    expect(after2!.outstandingPaisa).toBe(0);
  });
});
