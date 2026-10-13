/**
 * End-to-end acceptance tests.
 *
 * Each test below is one of the 18 scenarios listed in section 12 of the project brief
 * (mirroring PRD p.17 "Functional acceptance tests"). They drive the real Express API
 * over HTTP against a real MongoDB, so a green run demonstrates the whole stack.
 *
 * Scenario 18 (restore a backup in a test environment) is covered by backup.test.ts.
 */
import request from 'supertest';
import { createApp } from '../../app';
import { ROLES, SCHEME } from '../../constants';
import {
  CashMovement,
  Customer,
  CustomerAdvance,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  Installment,
  PartnerTransaction,
  Payment,
  SchemeEnrollment,
} from '../../models';
import { createTestUser, seedBase } from '../helpers';

const app = createApp();

/** supertest binary parser so an xlsx response can be inspected as a real Buffer. */
function binaryParser(res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function loginAs(role: string) {
  const { token } = await createTestUser(role as never, `${role}-acceptance@e2e.local`);
  return token;
}

describe('PRD acceptance scenarios (end to end over HTTP)', () => {
  let ownerToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    await seedBase();
    ownerToken = await loginAs(ROLES.OWNER);
    viewerToken = await loginAs(ROLES.VIEWER);
  });

  const api = () => request(app);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createCustomer(tokenNumber: number, monthly: number, location: 'MACH' | 'QUETTA' = 'MACH') {
    const res = await api()
      .post('/api/customers')
      .set(auth(ownerToken))
      .send({
        name: `Acceptance Customer ${tokenNumber}`,
        cnic: `54301${String(9000000 + tokenNumber).padStart(8, '0')}`,
        phone: `0300${String(1000000 + tokenNumber).slice(-7)}`,
        location,
        joiningDate: new Date().toISOString(),
        monthlyInstallmentPkr: monthly,
        tokenNumber,
      });
    expect(res.status).toBe(201);
    return {
      customerId: String(res.body.data.customer._id),
      enrollmentId: res.body.data.enrollmentId as string,
      cnic: res.body.data.customer.cnic as string,
      installmentCount: res.body.data.installmentCount as number,
    };
  }

  /* 1 --------------------------------------------------------------------------- */
  it('1. creates a customer and generates 28 installment periods', async () => {
    const created = await createCustomer(1, 12000);

    expect(created.installmentCount).toBe(SCHEME.INSTALLMENT_MONTHS);
    const installments = await api()
      .get(`/api/installments/customer/${created.customerId}`)
      .set(auth(ownerToken));
    // Paginated envelope: the schedule itself plus the server-computed totals.
    expect(installments.body.data.items).toHaveLength(28);
    expect(installments.body.data.pagination.total).toBe(28);
    expect(installments.body.data.totals.scheduledPaisa).toBe(28 * 12000 * 100);

    const token = await api().get('/api/tokens').set(auth(ownerToken));
    expect(token.body.data.total).toBe(120);
    expect(token.body.data.assigned).toBe(1);
  });

  /* 2 --------------------------------------------------------------------------- */
  it('2. all 28 installments use the same fixed monthly amount', async () => {
    const created = await createCustomer(2, 13500);
    const installments = await Installment.find({ enrollment: created.enrollmentId }).lean();
    expect(installments).toHaveLength(28);
    expect(new Set(installments.map((i) => i.scheduledPaisa))).toEqual(new Set([1350000]));

    const enrollment = await SchemeEnrollment.findById(created.enrollmentId).lean();
    expect(enrollment!.schemeTotalPaisa).toBe(1350000 * 28);
  });

  /* 3 --------------------------------------------------------------------------- */
  it('3. prevents a duplicate token assignment', async () => {
    await createCustomer(3, 10000);
    const second = await api()
      .post('/api/customers')
      .set(auth(ownerToken))
      .send({
        name: 'Duplicate Token Attempt',
        cnic: '5430199999999',
        phone: '03009999999',
        location: 'MACH',
        joiningDate: new Date().toISOString(),
        monthlyInstallmentPkr: 10000,
        tokenNumber: 3,
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('TOKEN_ALREADY_ASSIGNED');
    expect(await SchemeEnrollment.countDocuments({ tokenNumber: 3 })).toBe(1);
  });

  /* 4 --------------------------------------------------------------------------- */
  it('4. detects a duplicate CNIC according to the configured policy', async () => {
    const created = await createCustomer(4, 10000);

    // Default policy = block
    const blocked = await api()
      .post('/api/customers')
      .set(auth(ownerToken))
      .send({
        name: 'Same CNIC',
        cnic: created.cnic,
        phone: '03008888888',
        location: 'MACH',
        joiningDate: new Date().toISOString(),
        monthlyInstallmentPkr: 10000,
        tokenNumber: 5,
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DUPLICATE_CNIC');

    // Switch the policy to warn: the record is accepted with a warning
    await api().patch('/api/settings').set(auth(ownerToken)).send({ duplicateCnicPolicy: 'warn' });
    const warned = await api()
      .post('/api/customers')
      .set(auth(ownerToken))
      .send({
        name: 'Same CNIC Warned',
        cnic: created.cnic,
        phone: '03008888888',
        location: 'MACH',
        joiningDate: new Date().toISOString(),
        monthlyInstallmentPkr: 10000,
        tokenNumber: 6,
      });
    expect(warned.status).toBe(201);
    expect(warned.body.data.duplicateCnicWarning.count).toBe(1);
  });

  /* 5 --------------------------------------------------------------------------- */
  it('5. records a payment and updates the receipt, balance, report and cash ledger', async () => {
    const created = await createCustomer(7, 10000);

    const payment = await api()
      .post('/api/payments')
      .set(auth(ownerToken))
      .send({ customerId: created.customerId, monthNumbers: [1], amountPkr: 10000, method: 'CASH' });
    expect(payment.status).toBe(201);
    const paymentId = String(payment.body.data.payment._id);
    const receiptNumber = payment.body.data.receipt.number as string;
    expect(receiptNumber).toMatch(/^RCPT-\d{4}-\d+$/);

    // Installment balance
    const inst = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(inst!.paidPaisa).toBe(1000000);
    expect(inst!.status).toBe('paid');

    // Collection report
    const report = await api().get('/api/reports/collections?format=json').set(auth(ownerToken));
    expect(report.body.data.sheets[0].rows).toHaveLength(1);
    expect(report.body.data.sheets[0].totals[1].value).toBe(10000);

    // Cash ledger
    const movements = await CashMovement.find({ sourceRef: paymentId }).lean();
    expect(movements).toHaveLength(1);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(1000000);

    // Exactly one income mirror
    expect(await IncomeTransaction.countDocuments({ sourceRef: paymentId })).toBe(1);
  });

  /* 6 --------------------------------------------------------------------------- */
  it('6. records a partial payment and keeps the Partial status', async () => {
    const created = await createCustomer(8, 10000);
    await api()
      .post('/api/payments')
      .set(auth(ownerToken))
      .send({ customerId: created.customerId, monthNumbers: [1], amountPkr: 3000 });

    let inst = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(inst!.status).toBe('partial');
    expect(inst!.outstandingPaisa).toBe(700000);

    await api()
      .post('/api/payments')
      .set(auth(ownerToken))
      .send({ customerId: created.customerId, monthNumbers: [1], amountPkr: 7000 });
    inst = await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean();
    expect(inst!.status).toBe('paid');
  });

  /* 7 --------------------------------------------------------------------------- */
  it('7. confirms a draw in month 15 - months 16-28 stop and the customer leaves the collection list', async () => {
    const created = await createCustomer(9, 10000);
    for (let m = 1; m <= 15; m += 1) {
      await api()
        .post('/api/payments')
        .set(auth(ownerToken))
        .send({ customerId: created.customerId, monthNumbers: [m], amountPkr: 10000 });
    }

    const eligibleBefore = await api().get('/api/draws/eligible?schemeMonth=15').set(auth(ownerToken));
    expect(eligibleBefore.body.data.count).toBe(1);

    const draw = await api()
      .post('/api/draws')
      .set(auth(ownerToken))
      .send({ schemeMonth: 15, drawDate: new Date().toISOString(), winnerTokenNumber: 9, reference: 'E2E-15' });
    expect(draw.status).toBe(201);
    const drawId = String(draw.body.data._id);

    const confirm = await api().post(`/api/draws/${drawId}/confirm`).set(auth(ownerToken));
    expect(confirm.status).toBe(200);

    const installments = await Installment.find({ enrollment: created.enrollmentId }).sort({ monthNumber: 1 }).lean();
    expect(installments.slice(15).every((i) => i.status === 'not_applicable')).toBe(true);
    expect(installments.slice(15).every((i) => i.stoppedAfterDraw)).toBe(true);
    expect(installments.slice(0, 15).every((i) => i.status === 'paid')).toBe(true);

    // Leaves the active collection list, appears in Drawn/Closed
    const active = await api().get('/api/lists/active-collections').set(auth(ownerToken));
    expect(active.body.data.items).toHaveLength(0);
    const drawn = await api().get('/api/lists/drawn-closed').set(auth(ownerToken));
    expect(drawn.body.data.items).toHaveLength(1);
    expect(drawn.body.data.items[0].stoppedFromMonth).toBe(15);

    // History stays available
    const statement = await api().get(`/api/customers/${created.customerId}/statement`).set(auth(ownerToken));
    expect(statement.body.data.payments).toHaveLength(15);
    expect(statement.body.data.draws).toHaveLength(1);
    expect(statement.body.data.closures).toHaveLength(1);
    expect(await Payment.countDocuments({ customer: created.customerId, status: 'posted' })).toBe(15);
  });

  /* 8 --------------------------------------------------------------------------- */
  it('8. an Advance Bike case keeps the installment schedule active', async () => {
    const created = await createCustomer(10, 10000);
    const advance = await api()
      .post('/api/advances')
      .set(auth(ownerToken))
      .send({
        customerId: created.customerId,
        type: 'BIKE',
        advanceDate: new Date().toISOString(),
        amountPkr: 175000,
        bikeModel: 'Honda CD 70',
        bikeDescription: 'New, red',
        approver: 'Owner',
      });
    expect(advance.status).toBe(201);
    expect(advance.body.data.advance.stopsInstallments).toBe(false);
    expect(advance.body.data.payableInstallmentsRemaining).toBe(28);

    const bikes = await api().get('/api/lists/advance-bike').set(auth(ownerToken));
    expect(bikes.body.data.items).toHaveLength(1);

    const active = await api().get('/api/lists/active-collections').set(auth(ownerToken));
    expect(active.body.data.items).toHaveLength(1);
    expect(await Installment.countDocuments({ enrollment: created.enrollmentId, status: 'unpaid' })).toBe(28);
  });

  /* 9 --------------------------------------------------------------------------- */
  it('9. an Advance Cash case records the outflow once and installments continue', async () => {
    const created = await createCustomer(11, 10000);
    const advance = await api()
      .post('/api/advances')
      .set(auth(ownerToken))
      .send({
        customerId: created.customerId,
        type: 'CASH',
        advanceDate: new Date().toISOString(),
        amountPkr: 35000,
        method: 'CASH',
        purpose: 'Agreed cash advance',
      });
    expect(advance.status).toBe(201);
    const advanceId = String(advance.body.data.advance._id);

    expect(await CashMovement.countDocuments({ sourceRef: advanceId })).toBe(1);
    expect(await ExpenseTransaction.countDocuments({ sourceRef: advanceId })).toBe(1);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(-3500000);
    expect(await Installment.countDocuments({ enrollment: created.enrollmentId, status: 'unpaid' })).toBe(28);

    const cashList = await api().get('/api/lists/advance-cash').set(auth(ownerToken));
    expect(cashList.body.data.items).toHaveLength(1);
    expect(cashList.body.data.totals.totalPaisa).toBe(3500000);
  });

  /* 10 -------------------------------------------------------------------------- */
  it('10. an advance customer who later wins has future installments stopped and history kept', async () => {
    const created = await createCustomer(12, 10000);
    await api()
      .post('/api/advances')
      .set(auth(ownerToken))
      .send({ customerId: created.customerId, type: 'BIKE', advanceDate: new Date().toISOString(), amountPkr: 160000, bikeModel: 'YBR 125' });

    const draw = await api()
      .post('/api/draws')
      .set(auth(ownerToken))
      .send({ schemeMonth: 8, drawDate: new Date().toISOString(), winnerTokenNumber: 12 });
    await api().post(`/api/draws/${draw.body.data._id}/confirm`).set(auth(ownerToken));

    expect(await Installment.countDocuments({ enrollment: created.enrollmentId, stoppedAfterDraw: true })).toBe(20); // 9-28
    expect(await CustomerAdvance.countDocuments({ customer: created.customerId })).toBe(1);

    const statement = await api().get(`/api/customers/${created.customerId}/statement`).set(auth(ownerToken));
    expect(statement.body.data.advances).toHaveLength(1);
    expect(statement.body.data.advances[0].stopsInstallments).toBe(false);
    expect(statement.body.data.closures).toHaveLength(1);
  });

  /* 11 -------------------------------------------------------------------------- */
  it('11. a partner withdrawal affects cash outflow but not operating expenses', async () => {
    const partners = await api().get('/api/partners').set(auth(ownerToken));
    const partnerId = String(partners.body.data[0]._id);
    expect(partners.body.data.map((p: Record<string, unknown>) => p.name)).toEqual(['Irfan', 'Ghulam Muhammad', 'Hafiz Khalid']);

    const txn = await api()
      .post(`/api/partners/${partnerId}/transactions`)
      .set(auth(ownerToken))
      .send({ type: 'WITHDRAWAL', amountPkr: 22000, method: 'CASH', purpose: 'Personal withdrawal' });
    expect(txn.status).toBe(201);

    const dashboard = await api().get('/api/dashboard/summary').set(auth(ownerToken));
    expect(dashboard.body.data.partnerWithdrawals.today.paisa).toBe(2200000);
    expect(dashboard.body.data.operatingExpenses.today.paisa).toBe(0);
    expect(dashboard.body.data.cashFlow.totalOutflow.paisa).toBe(2200000);
    expect(dashboard.body.data.balances.cash.paisa).toBe(-2200000);

    const expenses = await api().get('/api/expenses?operatingOnly=true').set(auth(ownerToken));
    expect(expenses.body.data.items).toHaveLength(0);

    const summary = await api().get('/api/reports/financial-summary?format=json').set(auth(ownerToken));
    const rows = summary.body.data.sheets[0].rows as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.measure === 'Operating expenses')!.amount).toBe(0);
    expect(rows.find((r) => r.measure === 'Partner withdrawals (outflow, not operating)')!.amount).toBe(22000);
  });

  /* 12 -------------------------------------------------------------------------- */
  it('12. a partner contribution increases cash inflow but is not revenue', async () => {
    const partners = await api().get('/api/partners').set(auth(ownerToken));
    const partnerId = String(partners.body.data[1]._id);

    await api()
      .post(`/api/partners/${partnerId}/transactions`)
      .set(auth(ownerToken))
      .send({ type: 'CONTRIBUTION', amountPkr: 300000, method: 'BANK' });

    const incomes = await IncomeTransaction.find({}).lean();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].isRevenue).toBe(false);
    expect(incomes[0].category).toBe('PARTNER_CONTRIBUTION');

    const dashboard = await api().get('/api/dashboard/summary').set(auth(ownerToken));
    expect(dashboard.body.data.cashFlow.totalInflow.paisa).toBe(30000000);
    expect(dashboard.body.data.balances.bank.paisa).toBe(30000000);

    const summary = await api().get('/api/reports/financial-summary?format=json').set(auth(ownerToken));
    const rows = summary.body.data.sheets[0].rows as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.measure === 'Total revenue / income')!.amount).toBe(0);
    expect(rows.find((r) => r.measure === 'Partner capital contributions (funding, not revenue)')!.amount).toBe(300000);
  });

  /* 13 -------------------------------------------------------------------------- */
  it('13. a cash-to-bank transfer moves balances without creating revenue or expense', async () => {
    await api().post('/api/income').set(auth(ownerToken)).send({ category: 'BUSINESS_REVENUE', amountPkr: 100000, method: 'CASH' });
    const accounts = await api().get('/api/financial-accounts').set(auth(ownerToken));
    const cash = accounts.body.data.find((a: Record<string, unknown>) => a.type === 'CASH');
    const bank = accounts.body.data.find((a: Record<string, unknown>) => a.type === 'BANK');

    const transfer = await api()
      .post('/api/transfers')
      .set(auth(ownerToken))
      .send({ fromAccountId: cash._id, toAccountId: bank._id, amountPkr: 40000 });
    expect(transfer.status).toBe(201);

    expect((await FinancialAccount.findById(cash._id).lean())!.balancePaisa).toBe(6000000);
    expect((await FinancialAccount.findById(bank._id).lean())!.balancePaisa).toBe(4000000);
    expect(await IncomeTransaction.countDocuments({})).toBe(1); // unchanged
    expect(await ExpenseTransaction.countDocuments({})).toBe(0);

    const summary = await api().get('/api/reports/financial-summary?format=json').set(auth(ownerToken));
    const rows = summary.body.data.sheets[0].rows as Array<Record<string, unknown>>;
    // A transfer is a movement between accounts: it appears in both inflow and outflow
    // and therefore nets to zero, leaving the combined balance unchanged.
    expect(rows.find((r) => r.measure === 'Total cash inflow')!.amount).toBe(140000);
    expect(rows.find((r) => r.measure === 'Total cash outflow')!.amount).toBe(40000);
    expect(rows.find((r) => r.measure === 'Net cash movement')!.amount).toBe(100000);
    expect(rows.find((r) => r.measure === 'Combined closing balance')!.amount).toBe(100000);
  });

  /* 14 -------------------------------------------------------------------------- */
  it('14. report totals match the underlying transaction records', async () => {
    const a = await createCustomer(14, 10000);
    const b = await createCustomer(15, 10000, 'QUETTA');
    await api().post('/api/payments').set(auth(ownerToken)).send({ customerId: a.customerId, monthNumbers: [1, 2], amountPkr: 20000 });
    await api().post('/api/payments').set(auth(ownerToken)).send({ customerId: b.customerId, monthNumbers: [1], amountPkr: 6000, allowCredit: true });
    await api().post('/api/expenses').set(auth(ownerToken)).send({ category: 'TRAVELING', amountPkr: 3000 });

    const payments = await Payment.find({ status: 'posted' }).lean();
    const expected = payments.reduce((s, p) => s + p.amountPaisa, 0) / 100;

    const collections = await api().get('/api/reports/collections?format=json').set(auth(ownerToken));
    expect(collections.body.data.sheets[0].totals.find((t: Record<string, unknown>) => t.label === 'Total collected').value).toBe(expected);

    const dashboard = await api().get('/api/dashboard/summary').set(auth(ownerToken));
    expect(dashboard.body.data.collections.today.pkr).toBe(expected);

    const expenses = await ExpenseTransaction.find({ status: 'posted' }).lean();
    const expenseReport = await api().get('/api/reports/expenses?format=json').set(auth(ownerToken));
    expect(expenseReport.body.data.sheets[0].totals.find((t: Record<string, unknown>) => t.label === 'Operating expenses only').value).toBe(
      expenses.filter((e) => e.isOperatingExpense).reduce((s, e) => s + e.amountPaisa, 0) / 100
    );
  });

  /* 15 -------------------------------------------------------------------------- */
  it('15. exports match the filters and totals shown in the application', async () => {
    await createCustomer(16, 10000, 'MACH');
    await createCustomer(17, 10000, 'QUETTA');
    await createCustomer(18, 10000, 'MACH');

    const screen = await api().get('/api/customers?location=MACH').set(auth(ownerToken));
    expect(screen.body.data.pagination.total).toBe(2);

    const xlsx = await api()
      .get('/api/reports/customers?format=xlsx&location=MACH')
      .set(auth(ownerToken))
      .buffer(true)
      .parse(binaryParser as never);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as unknown as Buffer).slice(0, 2).toString()).toBe('PK');
    expect((xlsx.body as unknown as Buffer).length).toBeGreaterThan(3000);

    const json = await api().get('/api/reports/customers?format=json&location=MACH').set(auth(ownerToken));
    expect(json.body.data.sheets[0].rows).toHaveLength(2);
    expect(json.body.data.sheets[0].rows.every((r: Record<string, unknown>) => r.location === 'MACH')).toBe(true);
    expect(json.body.data.sheets[0].totals.find((t: Record<string, unknown>) => t.label === 'Customers').value).toBe(2);

    const pdf = await api().get('/api/reports/customers?format=pdf&location=MACH').set(auth(ownerToken));
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  /* 16 -------------------------------------------------------------------------- */
  it('16. reversing a payment keeps the original history and recalculates balances', async () => {
    const created = await createCustomer(19, 10000);
    const payment = await api()
      .post('/api/payments')
      .set(auth(ownerToken))
      .send({ customerId: created.customerId, monthNumbers: [1], amountPkr: 10000 });
    const paymentId = String(payment.body.data.payment._id);

    const reversed = await api()
      .post(`/api/payments/${paymentId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: 'Customer paid by the wrong method' });
    expect(reversed.status).toBe(200);

    const original = await Payment.findById(paymentId).lean();
    expect(original!.status).toBe('reversed');
    expect(original!.reversalReason).toBe('Customer paid by the wrong method');
    expect(await Payment.countDocuments({})).toBe(2); // original + reversal

    expect((await Installment.findOne({ enrollment: created.enrollmentId, monthNumber: 1 }).lean())!.paidPaisa).toBe(0);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(0);

    const trail = await api().get(`/api/payments/${paymentId}/trail`).set(auth(ownerToken));
    expect(trail.body.data.movements).toHaveLength(2);

    const audit = await api().get('/api/auth/audit-logs?entityType=Payment').set(auth(ownerToken));
    expect(audit.body.data.items.some((l: Record<string, unknown>) => l.action === 'REVERSAL')).toBe(true);
  });

  /* 17 -------------------------------------------------------------------------- */
  it('17. unauthorised users cannot perform restricted actions', async () => {
    const created = await createCustomer(20, 10000);

    const attempts = [
      ['post', '/api/customers', { name: 'X', cnic: '5430111111111', phone: '03001111111', location: 'MACH', joiningDate: new Date().toISOString(), monthlyInstallmentPkr: 1000, tokenNumber: 50 }],
      ['post', '/api/payments', { customerId: created.customerId, monthNumbers: [1], amountPkr: 100 }],
      ['post', '/api/draws', { schemeMonth: 1, drawDate: new Date().toISOString() }],
      ['post', '/api/advances', { customerId: created.customerId, type: 'CASH', advanceDate: new Date().toISOString(), amountPkr: 100 }],
      ['post', '/api/expenses', { category: 'DAILY_FOOD', amountPkr: 100 }],
      ['post', '/api/income', { category: 'BUSINESS_REVENUE', amountPkr: 100 }],
      ['post', '/api/transfers', { fromAccountId: '507f1f77bcf86cd799439011', toAccountId: '507f1f77bcf86cd799439012', amountPkr: 100 }],
      ['patch', '/api/settings', { currentSchemeMonth: 3 }],
      ['post', '/api/auth/users', { name: 'X', email: 'x@y.z', password: 'Password@1', role: 'owner' }],
    ] as const;

    for (const [method, url, body] of attempts) {
      const res = await (api() as never as Record<string, (u: string) => { set(h: Record<string, string>): { send(b: unknown): Promise<{ status: number }> } }>)[method](url)
        .set(auth(viewerToken))
        .send(body as never);
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }

    // Nothing was written by the viewer
    expect(await Customer.countDocuments({})).toBe(1);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(await ExpenseTransaction.countDocuments({})).toBe(0);
  });

  /* extras ----------------------------------------------------------------------- */
  it('keeps every business rule consistent across the whole workflow', async () => {
    const created = await createCustomer(21, 10000);
    await api().post('/api/payments').set(auth(ownerToken)).send({ customerId: created.customerId, autoAllocate: true, amountPkr: 25000 });

    const dashboard = await api().get('/api/dashboard/summary').set(auth(ownerToken));
    expect(dashboard.body.data.tokens.total).toBe(120);
    expect(dashboard.body.data.scheme.durationMonths).toBe(28);
    expect(dashboard.body.data.customers.active).toBe(1);
    expect(dashboard.body.data.collections.today.paisa).toBe(2500000);
    expect(dashboard.body.data.installments.partial).toBe(1); // month 3 part paid
    expect(dashboard.body.data.alerts.some((a: Record<string, unknown>) => String(a.message).includes('scheme month'))).toBe(true);
  });
});
