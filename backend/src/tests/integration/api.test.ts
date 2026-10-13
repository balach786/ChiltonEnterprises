import request from 'supertest';
import { createApp } from '../../app';
import { ROLES } from '../../constants';
import { Customer, FinancialAccount, Installment, Payment } from '../../models';
import { createCustomer } from '../../services/customer.service';
import { recordPayment } from '../../services/payment.service';
import { createDraw, confirmDraw } from '../../services/draw.service';
import { actorFor, createTestCustomer, createTestUser, seedBase, uniqueCnic } from '../helpers';
import { updateSettings } from '../../services/settings.service';

const app = createApp();

async function tokenFor(role: keyof typeof ROLES | string, extra?: string[], denied?: string[]) {
  const { user, token } = await createTestUser(role as never);
  if (extra?.length || denied?.length) {
    // requireAuth re-reads the user document on every request, so adjusting the stored
    // grant/deny lists is enough - the token itself carries no permissions.
    const { User } = await import('../../models/User');
    await User.updateOne(
      { _id: user._id },
      { $set: { extraPermissions: extra ?? [], deniedPermissions: denied ?? [] } }
    );
  }
  return token;
}

describe('REST API: health, authentication and authorisation', () => {
  beforeEach(async () => {
    await seedBase();
  });

  it('exposes an unauthenticated health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.state).toBe('connected');
    expect(res.body.data.database.expectedTokenSlots).toBe(120);
  });

  it('rejects a request without a token', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('signs in a valid user and returns permissions', async () => {
    await createTestUser(ROLES.ACCOUNTANT, 'accountant@login.local');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'accountant@login.local', password: 'Password@123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('accountant');
    expect(res.body.data.user.permissions).toContain('payment:create');
    expect(res.body.data.user.permissions).not.toContain('user:manage');
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await createTestUser(ROLES.OWNER, 'owner@login.local');

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@login.local', password: 'WrongPassword1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@login.local', password: 'Password@123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns the current user from /auth/me', async () => {
    const token = await tokenFor(ROLES.VIEWER);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('viewer');
  });

  it('changes a password with the correct current password', async () => {
    const token = await tokenFor(ROLES.ACCOUNTANT);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password@123', newPassword: 'NewPassword@456' });
    expect(res.status).toBe(200);

    const wrongCurrent = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword1', newPassword: 'AnotherPass@789' });
    expect(wrongCurrent.status).toBe(401);
  });

  it('returns a 404 with the standard envelope for an unknown route', async () => {
    const token = await tokenFor(ROLES.OWNER);
    const res = await request(app).get('/api/does-not-exist').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  describe('role based access control is enforced on the backend', () => {
    it('prevents a read-only viewer from creating anything', async () => {
      const token = await tokenFor(ROLES.VIEWER);

      const createCustomerRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Viewer Attempt',
          cnic: uniqueCnic(),
          phone: '03001234567',
          location: 'MACH',
          joiningDate: new Date().toISOString(),
          monthlyInstallmentPkr: 10000,
          tokenNumber: 70,
        });
      expect(createCustomerRes.status).toBe(403);
      expect(createCustomerRes.body.error.code).toBe('FORBIDDEN');
      expect(await Customer.countDocuments({})).toBe(0);

      const payment = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: '507f1f77bcf86cd799439011', monthNumbers: [1], amountPkr: 100 });
      expect(payment.status).toBe(403);

      const expense = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({ category: 'DAILY_FOOD', amountPkr: 100 });
      expect(expense.status).toBe(403);

      const settings = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentSchemeMonth: 5 });
      expect(settings.status).toBe(403);

      const users = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${token}`);
      expect(users.status).toBe(403);
    });

    it('lets a viewer read the dashboard, customers and reports', async () => {
      const token = await tokenFor(ROLES.VIEWER);
      await createTestCustomer({ tokenNumber: 71 });

      expect((await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).get('/api/tokens').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).get('/api/lists/active-collections').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).get('/api/reports').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    });

    it('prevents a customer-service user from confirming a draw', async () => {
      const token = await tokenFor(ROLES.CUSTOMER_SERVICE);
      await createTestCustomer({ tokenNumber: 72 });
      const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 72 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;

      const res = await request(app)
        .post(`/api/draws/${draw._id}/confirm`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('prevents an accountant from confirming a draw or managing users', async () => {
      const token = await tokenFor(ROLES.ACCOUNTANT);
      await createTestCustomer({ tokenNumber: 73 });
      const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 73 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;

      expect((await request(app).post(`/api/draws/${draw._id}/confirm`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).get('/api/auth/users').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).post('/api/payments').set('Authorization', `Bearer ${token}`).send({ customerId: '507f1f77bcf86cd799439011', monthNumbers: [1], amountPkr: 1 })).status).not.toBe(403);
    });

    it('prevents a draw manager from recording a payment', async () => {
      const token = await tokenFor(ROLES.DRAW_MANAGER);
      const created = await createTestCustomer({ tokenNumber: 74 });
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: String((created.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: 1000 });
      expect(res.status).toBe(403);
    });

    it('grants the draw manager confirmation when the permission is explicitly added', async () => {
      const token = await tokenFor(ROLES.DRAW_MANAGER, ['draw:confirm']);
      await createTestCustomer({ tokenNumber: 75 });
      const draw = (await createDraw({ schemeMonth: 1, drawDate: new Date(), winnerTokenNumber: 75 }, actorFor(ROLES.OWNER))) as Record<string, unknown>;

      const res = await request(app).post(`/api/draws/${draw._id}/confirm`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('prevents an owner without cnic:view from seeing full CNICs', async () => {
      const token = await tokenFor(ROLES.CUSTOMER_SERVICE, [], ['cnic:view']);
      const created = await createTestCustomer({ tokenNumber: 76 });
      const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].cnic).toMatch(/\*/);
      expect(created.customer.cnic).not.toMatch(/\*/);
    });
  });

  describe('request validation', () => {
    it('rejects an invalid CNIC, phone, location and token', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const base = {
        name: 'Validation Case',
        cnic: uniqueCnic(),
        phone: '03001234567',
        location: 'MACH',
        joiningDate: new Date().toISOString(),
        monthlyInstallmentPkr: 10000,
        tokenNumber: 77,
      };

      expect((await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({ ...base, cnic: '12' })).status).toBe(422);
      expect((await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({ ...base, phone: '12' })).status).toBe(422);
      expect((await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({ ...base, location: 'LAHORE' })).status).toBe(422);
      expect((await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({ ...base, tokenNumber: 500 })).status).toBe(422);
      expect((await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({ ...base, monthlyInstallmentPkr: -10 })).status).toBe(422);
      expect(await Customer.countDocuments({})).toBe(0);
    });

    it('rejects a payment with a negative amount', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const created = await createTestCustomer({ tokenNumber: 78 });
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: String((created.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: -5 });
      expect(res.status).toBe(422);
    });

    it('rejects an invalid ObjectId', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const res = await request(app).get('/api/customers/not-an-id').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('core endpoints return real data', () => {
    it('creates a customer over HTTP and returns the generated schedule', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'HTTP Customer',
          cnic: uniqueCnic(),
          phone: '03009876543',
          location: 'QUETTA',
          joiningDate: new Date().toISOString(),
          monthlyInstallmentPkr: 15000,
          tokenNumber: 80,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.installmentCount).toBe(28);
      expect(res.body.data.schemeTotalPaisa).toBe(15000 * 100 * 28);

      const list = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
      expect(list.body.data.pagination.total).toBe(1);

      const tokens = await request(app).get('/api/tokens').set('Authorization', `Bearer ${token}`);
      expect(tokens.body.data.total).toBe(120);
      expect(tokens.body.data.assigned).toBe(1);
      expect(tokens.body.data.unassigned).toBe(119);
    });

    it('records a payment over HTTP and returns the receipt', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const created = await createTestCustomer({ tokenNumber: 81, monthlyInstallmentPkr: 10000 });
      const customerId = String((created.customer as unknown as { _id: unknown })._id);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId, monthNumbers: [1], amountPkr: 10000, method: 'CASH' });

      expect(res.status).toBe(201);
      const payment = res.body.data.payment;
      expect(payment.amountPaisa).toBe(1000000);

      const receipt = await request(app).get(`/api/receipts/${payment.receipt}`).set('Authorization', `Bearer ${token}`);
      expect(receipt.status).toBe(200);
      expect(receipt.body.data.number).toMatch(/^RCPT-/);
      expect(receipt.body.data.amountPaisa).toBe(1000000);

      const installments = await request(app)
        .get(`/api/installments/customer/${customerId}`)
        .set('Authorization', `Bearer ${token}`);
      // The installment schedule is paginated like every other list endpoint; an enrolment
      // scoped query defaults to one full 28-month schedule.
      expect(installments.body.data.items).toHaveLength(28);
      expect(installments.body.data.pagination.total).toBe(28);
      expect(installments.body.data.totals.scheduledPaisa).toBe(28000000);
      expect(installments.body.data.totals.paidPaisa).toBe(1000000);

      const payments = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
      expect(payments.body.data.pagination.total).toBe(1);
    });

    it('exposes the automatic lists', async () => {
      const token = await tokenFor(ROLES.OWNER);
      await createTestCustomer({ tokenNumber: 82, location: 'MACH' });
      await createTestCustomer({ tokenNumber: 83, location: 'QUETTA' });

      const endpoints = [
        '/api/lists/active-collections',
        '/api/lists/drawn-closed',
        '/api/lists/advance-bike',
        '/api/lists/advance-cash',
        '/api/lists/overdue-partial',
        '/api/lists/token-register',
        '/api/lists/mach',
        '/api/lists/quetta',
        '/api/lists/draw-eligible?schemeMonth=1',
      ];
      for (const url of endpoints) {
        const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
        expect([url, res.status]).toEqual([url, 200]);
      }

      const mach = await request(app).get('/api/lists/mach').set('Authorization', `Bearer ${token}`);
      expect(mach.body.data.items).toHaveLength(1);
      const quetta = await request(app).get('/api/lists/quetta').set('Authorization', `Bearer ${token}`);
      expect(quetta.body.data.items).toHaveLength(1);
    });

    it('reads settings and updates the current scheme month', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const before = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);
      expect(before.body.data.currentSchemeMonth).toBe(1);

      const update = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentSchemeMonth: 7, reason: 'Scheme advanced' });
      expect(update.status).toBe(200);
      expect(update.body.data.currentSchemeMonth).toBe(7);

      const invalid = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentSchemeMonth: 40 });
      expect(invalid.status).toBe(422);
    });

    it('lists partners and financial accounts', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const partners = await request(app).get('/api/partners').set('Authorization', `Bearer ${token}`);
      expect(partners.body.data).toHaveLength(3);

      const accounts = await request(app).get('/api/financial-accounts').set('Authorization', `Bearer ${token}`);
      expect(accounts.body.data).toHaveLength(2);
      expect(accounts.body.data.map((a: Record<string, unknown>) => a.type).sort()).toEqual(['BANK', 'CASH']);
    });

    it('lists audit logs for the owner only', async () => {
      const ownerToken = await tokenFor(ROLES.OWNER);
      const created = await createTestCustomer({ tokenNumber: 84 });
      await recordPayment(
        { customerId: String((created.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: 1000 },
        actorFor(ROLES.OWNER)
      );

      const res = await request(app).get('/api/auth/audit-logs').set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);

      const accountant = await tokenFor(ROLES.ACCOUNTANT);
      expect((await request(app).get('/api/auth/audit-logs').set('Authorization', `Bearer ${accountant}`)).status).toBe(403);
    });
  });

  describe('data persistence', () => {
    it('keeps records available after a fresh app instance and reconnection', async () => {
      const token = await tokenFor(ROLES.OWNER);
      const created = await createTestCustomer({ tokenNumber: 85, monthlyInstallmentPkr: 9000 });
      const customerId = String((created.customer as unknown as { _id: unknown })._id);
      await recordPayment({ customerId, monthNumbers: [1], amountPkr: 9000 }, actorFor(ROLES.OWNER));

      // A brand new Express instance reading from the same database
      const secondApp = createApp();
      const customers = await request(secondApp).get('/api/customers').set('Authorization', `Bearer ${token}`);
      expect(customers.body.data.pagination.total).toBe(1);

      const installments = await Installment.countDocuments({ customer: customerId });
      expect(installments).toBe(28);
      expect(await Payment.countDocuments({ customer: customerId })).toBe(1);
      expect(await Customer.countDocuments({})).toBe(1);
      expect(await FinancialAccount.countDocuments({})).toBe(2);
    });
  });

  describe('configuration driven behaviour', () => {
    it('honours the duplicate CNIC policy when set to warn', async () => {
      const token = await tokenFor(ROLES.OWNER);
      await updateSettings({ duplicateCnicPolicy: 'warn' });
      const cnic = uniqueCnic();

      await createCustomer(
        { name: 'First', cnic, phone: '03001234567', location: 'MACH', joiningDate: new Date(), monthlyInstallmentPkr: 10000, tokenNumber: 86 },
        actorFor(ROLES.OWNER)
      );

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Second With Same CNIC',
          cnic,
          phone: '03007654321',
          location: 'MACH',
          joiningDate: new Date().toISOString(),
          monthlyInstallmentPkr: 10000,
          tokenNumber: 87,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.duplicateCnicWarning.count).toBe(1);
    });
  });
});
