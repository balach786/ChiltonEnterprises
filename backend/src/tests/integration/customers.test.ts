import { ROLES, SCHEME } from '../../constants';
import { Installment, SchemeEnrollment, Token, Customer } from '../../models';
import { createCustomer } from '../../services/customer.service';
import { getCustomerStatement, listCustomers, updateCustomer } from '../../services/customer.service';
import { getTokenRegister } from '../../services/token.service';
import { actorFor, createTestCustomer, seedBase, uniqueCnic } from '../helpers';

describe('customer and token management', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('creates a customer with exactly 28 installment periods at the fixed monthly amount', async () => {
    const result = await createTestCustomer({ monthlyInstallmentPkr: 12500 });

    expect(result.installmentCount).toBe(SCHEME.INSTALLMENT_MONTHS);
    expect(result.schemeTotalPaisa).toBe(12500 * 100 * 28);

    const installments = await Installment.find({ enrollment: result.enrollmentId }).sort({ monthNumber: 1 });
    expect(installments).toHaveLength(28);
    expect(new Set(installments.map((i) => i.scheduledPaisa)).size).toBe(1);
    expect(installments[0].scheduledPaisa).toBe(1250000);
    expect(installments.every((i) => i.status === 'unpaid')).toBe(true);

    const enrollment = await SchemeEnrollment.findById(result.enrollmentId).lean();
    expect(enrollment!.durationMonths).toBe(28);
    expect(enrollment!.schemeTotalPaisa).toBe(35000000);
    expect(enrollment!.outstandingPaisa).toBe(35000000);
  });

  it('rejects a scheme duration other than 28 months', async () => {
    await expect(
      createCustomer(
        {
          name: 'Bad Duration',
          cnic: uniqueCnic(),
          phone: '03001234567',
          location: 'MACH',
          joiningDate: new Date(),
          monthlyInstallmentPkr: 10000,
          tokenNumber: 5,
          durationMonths: 12,
        },
        actorFor(ROLES.OWNER)
      )
    ).rejects.toThrow(/28 months/);
  });

  it('marks the token as assigned and keeps the register at 120 slots', async () => {
    await createTestCustomer({ tokenNumber: 42 });

    const token = await Token.findOne({ number: 42 }).lean();
    expect(token!.status).toBe('assigned');

    const register = await getTokenRegister();
    expect(register.total).toBe(120);
    expect(register.assigned + register.unassigned).toBe(120);
    expect(register.items).toHaveLength(120);
    expect(register.items[0].code).toBe('001');
    expect(register.items[119].code).toBe('120');
  });

  it('prevents assigning the same token twice in the same scheme', async () => {
    await createTestCustomer({ tokenNumber: 7 });

    await expect(createTestCustomer({ tokenNumber: 7 })).rejects.toMatchObject({
      code: 'TOKEN_ALREADY_ASSIGNED',
    });

    // The second attempt must not have created a customer or an enrollment.
    expect(await SchemeEnrollment.countDocuments({ tokenNumber: 7 })).toBe(1);
  });

  it('rejects a token number outside the 001-120 range', async () => {
    await expect(createTestCustomer({ tokenNumber: 121 })).rejects.toThrow(/120/);
    await expect(createTestCustomer({ tokenNumber: 0 })).rejects.toThrow();
  });

  it('blocks a duplicate CNIC when the policy is block', async () => {
    const cnic = uniqueCnic();
    await createTestCustomer({ cnic, tokenNumber: 11 });

    await expect(createTestCustomer({ cnic, tokenNumber: 12 })).rejects.toMatchObject({ code: 'DUPLICATE_CNIC' });
  });

  it('allows a duplicate CNIC when the caller explicitly acknowledges the warning', async () => {
    const cnic = uniqueCnic();
    await createTestCustomer({ cnic, tokenNumber: 13 });

    const second = await createCustomer(
      {
        name: 'Same CNIC Acknowledged',
        cnic,
        phone: '03007654321',
        location: 'QUETTA',
        joiningDate: new Date(),
        monthlyInstallmentPkr: 10000,
        tokenNumber: 14,
        acknowledgeDuplicateCnic: true,
      },
      actorFor(ROLES.OWNER)
    );
    expect(second.installmentCount).toBe(28);
  });

  it('validates CNIC and phone formats', async () => {
    await expect(createTestCustomer({ cnic: '12345' })).rejects.toThrow(/13 digits/);
    await expect(createTestCustomer({ phone: '12345' })).rejects.toThrow(/Pakistani number/);
  });

  it('rejects a location other than Mach or Quetta', async () => {
    await expect(
      createCustomer(
        {
          name: 'Bad Location',
          cnic: uniqueCnic(),
          phone: '03001234567',
          location: 'KARACHI' as never,
          joiningDate: new Date(),
          monthlyInstallmentPkr: 10000,
          tokenNumber: 21,
        },
        actorFor(ROLES.OWNER)
      )
    ).rejects.toThrow(/Mach or Quetta/);
  });

  it('stores customer, draw, advance and payment statuses separately', async () => {
    const { customer } = await createTestCustomer();
    expect(customer.status).toBe('active');
    expect(customer.drawStatus).toBe('NONE');
    expect(customer.advanceBikeActive).toBe(false);
    expect(customer.advanceCashActive).toBe(false);
  });

  it('searches by token, name, CNIC, phone, location and status', async () => {
    const created = await createTestCustomer({ name: 'Searchable Name', tokenNumber: 33, location: 'QUETTA' });
    const customerId = String((created.customer as unknown as { _id: unknown })._id);

    expect((await listCustomers({ search: 'Searchable' })).items).toHaveLength(1);
    expect(((await listCustomers({ search: '33' })).items[0] as Record<string, unknown>).tokenNumber).toBe(33);
    expect((await listCustomers({ location: 'QUETTA' })).items).toHaveLength(1);
    expect((await listCustomers({ location: 'MACH' })).items).toHaveLength(0);
    expect((await listCustomers({ status: 'active' })).items).toHaveLength(1);
    expect((await listCustomers({ status: 'drawn_closed' })).items).toHaveLength(0);
    expect((await listCustomers({ search: created.customer.cnic })).items).toHaveLength(1);
    expect((await listCustomers({ search: created.customer.phone })).items[0]).toBeTruthy();
  });

  it('masks the CNIC for users without the cnic:view permission', async () => {
    const created = await createTestCustomer();
    const id = String((created.customer as unknown as { _id: unknown })._id);

    const masked = (await listCustomers({ canViewCnic: false })).items[0] as Record<string, unknown>;
    expect(String(masked.cnic)).toMatch(/^\d{2}\*{7}\d{3}$/);

    const full = (await listCustomers({ canViewCnic: true })).items[0] as Record<string, unknown>;
    expect(full.cnic).toBe(created.customer.cnic);
    expect(id).toBeTruthy();
  });

  it('updates authorised profile fields and records the change in the audit trail', async () => {
    const created = await createTestCustomer();
    const id = String((created.customer as unknown as { _id: unknown })._id);

    const updated = (await updateCustomer(id, { phone: '03331112223', notes: 'updated' }, actorFor(ROLES.OWNER), 'Contact update')) as Record<string, unknown>;
    expect(updated.phone).toBe('03331112223');

    const { AuditLog } = await import('../../models/AuditLog');
    const logs = await AuditLog.find({ entityType: 'Customer', entityId: id }).lean();
    expect(logs.some((l) => l.action === 'UPDATE')).toBe(true);
  });

  it('refuses to reactivate a drawn/closed customer without an authorised correction', async () => {
    const created = await createTestCustomer();
    const id = String((created.customer as unknown as { _id: unknown })._id);
    await Customer.updateOne({ _id: id }, { $set: { drawStatus: 'CONFIRMED', status: 'drawn_closed' } });

    await expect(updateCustomer(id, { status: 'active' }, actorFor(ROLES.OWNER))).rejects.toThrow(/drawn\/closed/i);
  });

  it('exposes a full statement with schedule, payments, draws and advances', async () => {
    const created = await createTestCustomer();
    const id = String((created.customer as unknown as { _id: unknown })._id);
    const statement = await getCustomerStatement(id, true);

    expect(statement.installments).toHaveLength(28);
    expect(statement.enrollments).toHaveLength(1);
    expect(statement.payments).toEqual([]);
    expect(statement.draws).toEqual([]);
    expect(statement.advances).toEqual([]);
  });
});
