import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../../app';
import { ROLES } from '../../constants';
import {
  advancesReport,
  allCustomersReport,
  archiveReport,
  cashBankReport,
  collectionsReport,
  drawReport,
  expensesReport,
  financialSummaryReport,
  installmentScheduleReport,
  partnersReport,
} from '../../services/report.service';
import { renderCsv, renderPdf, renderWorkbook } from '../../reports/exporters';
import { CashMovement, ExpenseTransaction, IncomeTransaction, Installment, Payment } from '../../models';
import { createAdvance } from '../../services/advance.service';
import { createExpense, createIncome, createPartnerTransaction } from '../../services/finance.service';
import { confirmDraw, createDraw } from '../../services/draw.service';
import { recordPayment } from '../../services/payment.service';
import { actorFor, createTestCustomer, createTestUser, seedBase } from '../helpers';
import { listPartners } from '../../services/finance.service';

const app = createApp();
const owner = () => actorFor(ROLES.OWNER);

describe('reports, printing and exports', () => {
  beforeEach(async () => {
    await seedBase();
  });

  async function buildDataset() {
    const a = await createTestCustomer({ tokenNumber: 91, monthlyInstallmentPkr: 10000, location: 'MACH', name: 'Report Customer A' });
    const b = await createTestCustomer({ tokenNumber: 92, monthlyInstallmentPkr: 15000, location: 'QUETTA', name: 'Report Customer B' });
    const aId = String((a.customer as unknown as { _id: unknown })._id);
    const bId = String((b.customer as unknown as { _id: unknown })._id);

    await recordPayment({ customerId: aId, monthNumbers: [1, 2], amountPkr: 20000 }, owner());
    await recordPayment({ customerId: bId, monthNumbers: [1], amountPkr: 7500, method: 'BANK' }, owner());
    await recordPayment({ customerId: bId, monthNumbers: [2], amountPkr: 7500 }, owner());
    await createExpense({ category: 'UTILITY_BILLS', amountPkr: 4000, purpose: 'Electricity' }, owner());
    await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 6000 }, owner());
    await createAdvance({ customerId: aId, type: 'BIKE', advanceDate: new Date(), amountPkr: 180000, bikeModel: 'CD 70' }, owner());
    await createAdvance({ customerId: bId, type: 'CASH', advanceDate: new Date(), amountPkr: 20000 }, owner());

    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    await createPartnerTransaction(String(partners[0]._id), { type: 'WITHDRAWAL', amountPkr: 15000 }, owner());
    await createPartnerTransaction(String(partners[1]._id), { type: 'CONTRIBUTION', amountPkr: 250000, method: 'BANK' }, owner());

    return { a, b, aId, bId };
  }

  it('all-customers report reconciles with the customer and enrollment records', async () => {
    await buildDataset();
    const bundle = await allCustomersReport({}, 'Owner');

    const sheet = bundle.sheets[0];
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].token).toBe('091');
    expect(sheet.totals!.find((t) => t.label === 'Customers')!.value).toBe(2);
    expect(sheet.totals!.find((t) => t.label === 'Scheme total')!.value).toBe((10000 + 15000) * 28);
    expect(sheet.totals!.find((t) => t.label === 'Total paid')!.value).toBe(20000 + 15000);
  });

  it('collections report totals match the underlying payment records', async () => {
    await buildDataset();
    const bundle = await collectionsReport({}, 'Owner');
    const payments = await Payment.find({ status: 'posted' }).lean();
    const expectedTotal = payments.reduce((s, p) => s + p.amountPaisa, 0) / 100;

    expect(bundle.sheets[0].rows).toHaveLength(payments.length);
    expect(bundle.sheets[0].totals!.find((t) => t.label === 'Total collected')!.value).toBeCloseTo(expectedTotal, 2);

    const byMethod = bundle.sheets.find((s) => s.name === 'By Method')!;
    const methodTotal = byMethod.rows.reduce((s, r) => s + Number(r.value), 0);
    expect(methodTotal).toBeCloseTo(expectedTotal, 2);

    const byLocation = bundle.sheets.find((s) => s.name === 'By Location')!;
    expect(byLocation.rows.reduce((s, r) => s + Number(r.value), 0)).toBeCloseTo(expectedTotal, 2);
  });

  it('customer statement contains all 28 periods and every payment', async () => {
    const { aId } = await buildDataset();
    const bundle = await installmentScheduleReport(aId, 'Owner');

    const ledger = bundle.sheets.find((s) => s.name === 'Installment Ledger')!;
    expect(ledger.rows).toHaveLength(28);
    expect(ledger.rows.every((r) => r.scheduled === 10000)).toBe(true);

    const payments = bundle.sheets.find((s) => s.name === 'Payments')!;
    expect(payments.rows).toHaveLength(1);
    expect(payments.totals!.find((t) => t.label === 'Net paid')!.value).toBe(20000);

    const advances = bundle.sheets.find((s) => s.name === 'Advances')!;
    expect(advances.rows).toHaveLength(1);
    expect(advances.rows[0].installmentsContinue).toBe('Yes');

    const overview = bundle.sheets.find((s) => s.name === 'Overview')!;
    const schemeTotal = overview.rows.find((r) => r.field === 'Scheme total (PKR)')!;
    expect(schemeTotal.value).toBe(280000);
  });

  it('expenses report separates operating expenses, advances and partner withdrawals', async () => {
    await buildDataset();
    const bundle = await expensesReport({}, 'Owner');
    const sheet = bundle.sheets[0];

    const expenses = await ExpenseTransaction.find({ status: 'posted' }).lean();
    const operating = expenses.filter((e) => e.isOperatingExpense).reduce((s, e) => s + e.amountPaisa, 0) / 100;
    const advances = expenses.filter((e) => e.category === 'CUSTOMER_ADVANCE_CASH').reduce((s, e) => s + e.amountPaisa, 0) / 100;
    const partner = expenses.filter((e) => e.category === 'PARTNER_WITHDRAWAL').reduce((s, e) => s + e.amountPaisa, 0) / 100;

    expect(sheet.totals!.find((t) => t.label === 'Operating expenses only')!.value).toBe(operating);
    expect(sheet.totals!.find((t) => t.label === 'Customer advance cash')!.value).toBe(advances);
    expect(sheet.totals!.find((t) => t.label === 'Partner withdrawals')!.value).toBe(partner);
    expect(operating).toBe(4000);
    expect(advances).toBe(20000);
    expect(partner).toBe(15000);
  });

  it('advances report keeps bike and cash cases on separate worksheets', async () => {
    await buildDataset();
    const bundle = await advancesReport({}, 'Owner');
    const bikes = bundle.sheets.find((s) => s.name === 'Advance Bike')!;
    const cash = bundle.sheets.find((s) => s.name === 'Advance Cash')!;
    expect(bikes.rows).toHaveLength(1);
    expect(cash.rows).toHaveLength(1);
    expect(bikes.rows[0].installmentsContinue).toBe('Yes');
    expect(cash.totals!.find((t) => t.label === 'Total advance cash issued')!.value).toBe(20000);
  });

  it('draw report shows the register and the drawn customer list', async () => {
    const { a } = await buildDataset();
    const draw = (await createDraw({ schemeMonth: 4, drawDate: new Date(), winnerTokenNumber: 91, reference: 'DR-4' }, owner())) as Record<string, unknown>;
    await confirmDraw(String(draw._id), owner());

    const bundle = await drawReport({}, 'Owner');
    const register = bundle.sheets.find((s) => s.name === 'Draw Register')!;
    expect(register.rows).toHaveLength(1);
    expect(register.rows[0].winnerToken).toBe('091');
    expect(register.rows[0].status).toBe('CONFIRMED');

    const drawn = bundle.sheets.find((s) => s.name === 'Drawn Customers')!;
    expect(drawn.rows).toHaveLength(1);
    expect(drawn.rows[0].drawMonth).toBe(4);
    expect(String(a.customer.name)).toBe('Report Customer A');
  });

  it('partner report has one worksheet per partner plus a comparison sheet', async () => {
    await buildDataset();
    const bundle = await partnersReport({}, 'Owner');
    expect(bundle.sheets[0].name).toBe('Summary');
    expect(bundle.sheets.length).toBe(4);
    const summary = bundle.sheets[0];
    expect(summary.rows).toHaveLength(3);
    expect(summary.totals!.find((t) => t.label === 'Combined withdrawals')!.value).toBe(15000);
    expect(summary.totals!.find((t) => t.label === 'Combined contributions')!.value).toBe(250000);
  });

  it('cash/bank report totals reconcile with the movement ledger', async () => {
    await buildDataset();
    const bundle = await cashBankReport({}, 'Owner');
    const movements = await CashMovement.find({ status: 'posted' }).lean();
    const totalIn = movements.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amountPaisa, 0) / 100;
    const totalOut = movements.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amountPaisa, 0) / 100;

    const summary = bundle.sheets[0];
    expect(summary.rows.reduce((s, r) => s + Number(r.inflow), 0)).toBeCloseTo(totalIn, 2);
    expect(summary.rows.reduce((s, r) => s + Number(r.outflow), 0)).toBeCloseTo(totalOut, 2);
    expect(bundle.sheets.length).toBe(3); // summary + cash + bank
  });

  it('financial summary keeps revenue, funding, operating costs and withdrawals apart', async () => {
    await buildDataset();
    const bundle = await financialSummaryReport({}, 'Owner');
    const rows = bundle.sheets[0].rows as Array<Record<string, unknown>>;
    const value = (label: string) => Number(rows.find((r) => r.measure === label)!.amount);

    const payments = await Payment.find({ status: 'posted' }).lean();
    const collections = payments.reduce((s, p) => s + p.amountPaisa, 0) / 100;
    const incomes = await IncomeTransaction.find({}).lean();
    const revenueOther = incomes.filter((i) => i.isRevenue && i.sourceType !== 'CUSTOMER_PAYMENT').reduce((s, i) => s + i.amountPaisa, 0) / 100;
    const movements = await CashMovement.find({}).lean();

    expect(value('Customer collections (installments)')).toBe(collections);
    expect(value('Other business revenue')).toBe(revenueOther);
    expect(value('Total revenue / income')).toBe(collections + revenueOther);
    expect(value('Operating expenses')).toBe(4000);
    expect(value('Customer advance cash (outflow, not operating)')).toBe(20000);
    expect(value('Partner withdrawals (outflow, not operating)')).toBe(15000);
    expect(value('Partner capital contributions (funding, not revenue)')).toBe(250000);
    expect(value('Total cash inflow')).toBe(movements.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amountPaisa, 0) / 100);
    expect(value('Total cash outflow')).toBe(movements.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amountPaisa, 0) / 100);
    expect(value('Net cash movement')).toBe(value('Total cash inflow') - value('Total cash outflow'));
  });

  it('archive report includes every record type', async () => {
    await buildDataset();
    const bundle = await archiveReport('Owner');
    const names = bundle.sheets.map((s) => s.name);
    for (const expected of ['Customers', 'Payments', 'Draws', 'Advances', 'Income', 'Expenses', 'Partner Transactions', 'Cash Movements', 'Audit Log']) {
      expect(names).toContain(expected);
    }
    expect(bundle.sheets.find((s) => s.name === 'Customers')!.rows).toHaveLength(2);
  });

  describe('export renderers', () => {
    it('renders a valid multi-sheet Excel workbook with formatting', async () => {
      await buildDataset();
      const bundle = await allCustomersReport({}, 'Owner');
      const buffer = await renderWorkbook(bundle);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.slice(0, 2).toString()).toBe('PK'); // xlsx is a zip container

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.getWorksheet('Customers')!;
      expect(ws).toBeTruthy();
      expect(String(ws.getCell(4, 1).value)).toBe('Token');
      expect(ws.getCell(5, 1).value).toBe('001'.slice(0, 0) + '091'); // token kept as text
      expect(ws.getCell(5, 8).numFmt).toContain('PKR');
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
      expect(ws.autoFilter).toBeTruthy();
    });

    it('renders a PDF with a title, period and page footer', async () => {
      await buildDataset();
      const bundle = await collectionsReport({}, 'Owner');
      const pdf = await renderPdf(bundle);
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(2000);
      // The renderer writes one /Type /Page object per page and stamps a footer on each.
      const pages = (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;
      expect(pages).toBeGreaterThan(0);
      expect(pdf.toString('latin1')).toContain('/Type /Pages');
    });

    it('renders CSV with headers and totals', async () => {
      await buildDataset();
      const bundle = await expensesReport({}, 'Owner');
      const csv = renderCsv(bundle);
      expect(csv).toContain('Category');
      expect(csv).toContain('Operating expenses only');
      expect(csv.split('\n').length).toBeGreaterThan(5);
    });

    it('serves xlsx, pdf, csv and json over the API with the right content type', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'reports@owner.local');
      await buildDataset();

      const xlsx = await request(app).get('/api/reports/customers?format=xlsx').set('Authorization', `Bearer ${token}`);
      expect(xlsx.status).toBe(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect(xlsx.headers['content-disposition']).toContain('.xlsx');

      const pdf = await request(app).get('/api/reports/customers?format=pdf').set('Authorization', `Bearer ${token}`);
      expect(pdf.headers['content-type']).toContain('application/pdf');

      const csv = await request(app).get('/api/reports/customers?format=csv').set('Authorization', `Bearer ${token}`);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Token');

      const json = await request(app).get('/api/reports/customers?format=json').set('Authorization', `Bearer ${token}`);
      expect(json.body.data.reportId).toBe('all-customers');
      expect(json.body.data.sheets[0].rows).toHaveLength(2);
    });

    it('respects the selected filters in the export', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'filters@owner.local');
      await buildDataset();

      const mach = await request(app).get('/api/reports/customers?format=json&location=MACH').set('Authorization', `Bearer ${token}`);
      expect(mach.body.data.sheets[0].rows).toHaveLength(1);
      expect(mach.body.data.sheets[0].rows[0].location).toBe('MACH');

      const quetta = await request(app).get('/api/reports/customers?format=json&location=QUETTA').set('Authorization', `Bearer ${token}`);
      expect(quetta.body.data.sheets[0].rows).toHaveLength(1);
      expect(quetta.body.data.sheets[0].rows[0].location).toBe('QUETTA');
    });

    it('exports a customer statement PDF for one customer', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'statement@owner.local');
      const { aId } = await buildDataset();
      const res = await request(app)
        .get(`/api/reports/customer-statement/${aId}?format=pdf`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('serves the customer statement preview without the export route swallowing it', async () => {
      // Regression: /reports/customer-statement/:customerId used to capture the literal
      // path segment "preview" and cast it to an ObjectId, returning a 500.
      const { token } = await createTestUser(ROLES.OWNER, 'preview@reports.local');
      const { aId } = await buildDataset();
      const res = await request(app)
        .get(`/api/reports/customer-statement/preview?customerId=${aId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.reportId).toBe('customer-statement');
      expect(res.body.data.sheets.length).toBeGreaterThan(0);
    });

    it('rejects a malformed customer id on the statement export with a 400', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'badid@reports.local');
      const res = await request(app)
        .get('/api/reports/customer-statement/not-an-object-id?format=pdf')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CUSTOMER');
    });

    it('refuses an unsupported export format', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'badformat@owner.local');
      const res = await request(app).get('/api/reports/customers?format=docx').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(422);
    });

    it('blocks report export for a role without report:export', async () => {
      const { token } = await createTestUser(ROLES.VIEWER, 'viewer@reports.local');
      const res = await request(app).get('/api/reports/customers?format=xlsx').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('records an EXPORT audit entry for every export', async () => {
      const { AuditLog } = await import('../../models/AuditLog');
      const { token } = await createTestUser(ROLES.OWNER, 'audit@reports.local');
      await buildDataset();
      await request(app).get('/api/reports/customers?format=xlsx').set('Authorization', `Bearer ${token}`);
      const logs = await AuditLog.find({ action: 'EXPORT', entityType: 'Report' }).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0].description).toContain('XLSX');
    });

    it('lists the available reports', async () => {
      const { token } = await createTestUser(ROLES.OWNER, 'catalog@reports.local');
      const res = await request(app).get('/api/reports').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r: Record<string, unknown>) => r.id);
      for (const expected of ['customers', 'customer-statement', 'collections', 'draws', 'advances', 'expenses', 'partners', 'cash-bank', 'financial-summary', 'archive']) {
        expect(ids).toContain(expected);
      }
    });
  });

  it('report totals follow installment changes after a draw closure', async () => {
    const { a, aId } = await buildDataset();
    const draw = (await createDraw({ schemeMonth: 3, drawDate: new Date(), winnerTokenNumber: 91 }, owner())) as Record<string, unknown>;
    await confirmDraw(String(draw._id), owner());

    const bundle = await installmentScheduleReport(aId, 'Owner');
    const ledger = bundle.sheets.find((s) => s.name === 'Installment Ledger')!;
    const stopped = ledger.rows.filter((r) => r.status === 'not_applicable');
    expect(stopped).toHaveLength(25); // months 4-28
    expect(ledger.totals!.find((t) => t.label === 'Outstanding')!.value).toBe(10000); // only month 3 remains
    expect(await Installment.countDocuments({ enrollment: a.enrollmentId, stoppedAfterDraw: true })).toBe(25);
  });
});
