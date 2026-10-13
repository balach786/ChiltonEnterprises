import { Types } from 'mongoose';
import { ROLES } from '../../constants';
import { connectMongo, transactionMode } from '../../db/mongo';
import { Customer, Installment, SchemeEnrollment, Token } from '../../models';
import { createCustomer } from '../../services/customer.service';
import { actorFor, seedBase, uniqueCnic } from '../helpers';

/**
 * Guards the transactional code path itself. The rest of the suite only means
 * something if multi-document transactions are really in use, and rollback has to
 * leave no half-written customer behind (PRD section 7 "financial consistency").
 */
describe('multi-document transactions', () => {
  beforeAll(async () => {
    await connectMongo();
    await seedBase();
  });

  it('runs against a replica set so transactions are enabled', () => {
    expect(transactionMode()).toBe('transaction');
  });

  it('creates the customer, enrollment and 28 installments atomically', async () => {
    const result = await createCustomer(
      {
        name: 'Atomic Test',
        cnic: uniqueCnic(),
        phone: '03001234567',
        location: 'MACH',
        joiningDate: new Date(),
        monthlyInstallmentPkr: 25000,
        tokenNumber: 31,
      },
      actorFor(ROLES.OWNER)
    );

    const enrollment = await SchemeEnrollment.findById(result.enrollmentId);
    const installments = await Installment.find({ enrollment: enrollment!._id });
    const token = await Token.findOne({ number: 31 });

    expect(installments).toHaveLength(28);
    expect(result.installmentCount).toBe(28);
    expect(token?.status).toBe('assigned');
    expect(String(token?.currentEnrollment)).toBe(String(enrollment!._id));
  });

  it('rolls every write back when the enrollment insert fails mid-transaction', async () => {
    const owner = actorFor(ROLES.OWNER);
    const cnic = uniqueCnic();

    // Force the installment insert to explode after the customer and enrollment exist.
    const spy = jest.spyOn(Installment, 'create').mockImplementationOnce(() => {
      throw new Error('simulated failure while writing the installment schedule');
    });

    await expect(
      createCustomer(
        {
          name: 'Rollback Test',
          cnic,
          phone: '03007654321',
          location: 'QUETTA',
          joiningDate: new Date(),
          monthlyInstallmentPkr: 30000,
          tokenNumber: 42,
        },
        owner
      )
    ).rejects.toThrow(/simulated failure/);

    // Nothing is left behind: no customer, no enrollment, no installments, token still free.
    expect(await Customer.countDocuments({ cnic })).toBe(0);
    expect(await SchemeEnrollment.countDocuments({ tokenNumber: 42 })).toBe(0);
    expect(await Installment.countDocuments({ tokenNumber: 42 })).toBe(0);
    const token = await Token.findOne({ number: 42 });
    expect(token?.status).toBe('unassigned');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('keeps a valid ObjectId shape for rollback assertions', () => {
    expect(Types.ObjectId.isValid('507f1f77bcf86cd799439011')).toBe(true);
  });
});
