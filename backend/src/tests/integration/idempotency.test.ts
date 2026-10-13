import { ROLES } from '../../constants';
import { CashMovement, IncomeTransaction, Installment, Payment, Receipt } from '../../models';
import { recordPayment } from '../../services/payment.service';
import { actorFor, createTestCustomer, seedBase } from '../helpers';

/**
 * PRD rule: a payment must never be recorded twice. Two failure modes matter here:
 *  1. the same request arriving twice at the same moment (double click, flaky network), and
 *  2. a retry after the server committed but the client never received the response.
 * Both are guarded by the unique sparse index on Payment.idempotencyKey plus the replay path
 * in recordPayment().
 */
describe('payment idempotency', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('records exactly one payment when the same request is submitted concurrently', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const input = {
      customerId,
      monthNumbers: [1],
      amountPkr: 10000,
      method: 'CASH' as const,
      idempotencyKey: 'concurrent-double-submit',
    };

    const results = await Promise.all([
      recordPayment(input, actorFor(ROLES.OWNER)),
      recordPayment(input, actorFor(ROLES.OWNER)),
    ]);

    // Both callers see the same payment - the second one is a replay, not a second charge.
    const first = results[0].payment as Record<string, unknown>;
    const second = results[1].payment as Record<string, unknown>;
    expect(String(second._id)).toBe(String(first._id));

    expect(await Payment.countDocuments({ idempotencyKey: 'concurrent-double-submit' })).toBe(1);
    expect(await Payment.countDocuments({ customer: customerId })).toBe(1);
    expect(await Receipt.countDocuments({})).toBe(1);
    expect(await CashMovement.countDocuments({ sourceRef: first._id })).toBe(1);
    expect(await IncomeTransaction.countDocuments({ sourceRef: first._id })).toBe(1);

    // The installment is credited once, not twice.
    const installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(installment!.paidPaisa).toBe(1000000);
    expect(installment!.status).toBe('paid');
  });

  it('replays the original payment when a retry arrives after the response was lost', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    const input = {
      customerId,
      monthNumbers: [2],
      amountPkr: 10000,
      method: 'CASH' as const,
      idempotencyKey: 'retry-after-lost-response',
    };

    const first = await recordPayment(input, actorFor(ROLES.OWNER));
    const retry = await recordPayment(input, actorFor(ROLES.OWNER));

    const firstId = String((first.payment as Record<string, unknown>)._id);
    expect(String((retry.payment as Record<string, unknown>)._id)).toBe(firstId);

    expect(await Payment.countDocuments({ customer: customerId })).toBe(1);
    expect(await CashMovement.countDocuments({ customer: customerId })).toBe(1);

    const installment = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 2 }).lean();
    expect(installment!.paidPaisa).toBe(1000000);
  });

  it('still records two separate payments when the idempotency keys differ', async () => {
    const created = await createTestCustomer({ monthlyInstallmentPkr: 10000 });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    await recordPayment(
      { customerId, monthNumbers: [1], amountPkr: 10000, method: 'CASH', idempotencyKey: 'key-a' },
      actorFor(ROLES.OWNER)
    );
    await recordPayment(
      { customerId, monthNumbers: [2], amountPkr: 10000, method: 'CASH', idempotencyKey: 'key-b' },
      actorFor(ROLES.OWNER)
    );

    expect(await Payment.countDocuments({ customer: customerId })).toBe(2);
    expect(await CashMovement.countDocuments({ customer: customerId })).toBe(2);
  });
});
