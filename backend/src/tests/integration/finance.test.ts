import { ROLES } from '../../constants';
import {
  CashMovement,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  Partner,
  PartnerTransaction,
  Reconciliation,
  Transfer,
} from '../../models';
import {
  createAccount,
  createExpense,
  createIncome,
  createPartnerTransaction,
  createReconciliation,
  createTransfer,
  listExpenses,
  listIncome,
  listPartnerTransactions,
  listPartners,
  recalcPartnerBalances,
  reverseExpense,
} from '../../services/finance.service';
import { getDashboardSummary } from '../../services/dashboard.service';
import { actorFor, seedBase } from '../helpers';

const owner = () => actorFor(ROLES.OWNER);
const accountId = async (type: 'CASH' | 'BANK') => String((await FinancialAccount.findOne({ type }).lean())!._id);

describe('income, expenses, partners and cash/bank accounting', () => {
  beforeEach(async () => {
    await seedBase();
  });

  /* --------------------------------------------------------------- income --------- */

  it('records business revenue and classifies it as revenue', async () => {
    const income = (await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 25000, method: 'CASH' }, owner())) as Record<string, unknown>;
    expect(income.isRevenue).toBe(true);
    expect(income.amountPaisa).toBe(2500000);
    expect(await CashMovement.countDocuments({ direction: 'IN' })).toBe(1);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(2500000);
  });

  it('CRITICAL: a partner contribution is funding, not revenue', async () => {
    const partners = await listPartners();
    const partner = (partners as unknown as Array<Record<string, unknown>>)[0];
    await createPartnerTransaction(String(partner._id), { type: 'CONTRIBUTION', amountPkr: 500000, method: 'BANK' }, owner());

    const incomes = await IncomeTransaction.find({}).lean();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].category).toBe('PARTNER_CONTRIBUTION');
    expect(incomes[0].isRevenue).toBe(false);

    const revenueTotal = await IncomeTransaction.aggregate([
      { $match: { isRevenue: true } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]);
    expect(revenueTotal).toHaveLength(0);

    // ...but it IS cash inflow
    const inflow = await CashMovement.aggregate([
      { $match: { direction: 'IN' } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]);
    expect(inflow[0].total).toBe(50000000);
  });

  it('forces installment collections through the payment workflow', async () => {
    await expect(createIncome({ category: 'CUSTOMER_INSTALLMENT', amountPkr: 1000 }, owner())).rejects.toMatchObject({
      code: 'USE_PAYMENT_WORKFLOW',
    });
  });

  it('rejects a zero or negative income amount', async () => {
    await expect(createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 0 }, owner())).rejects.toThrow();
    await expect(createIncome({ category: 'BUSINESS_REVENUE', amountPkr: -10 }, owner())).rejects.toThrow();
  });

  /* ------------------------------------------------------------- expenses --------- */

  it('records an operating expense and reduces the cash balance', async () => {
    const expense = (await createExpense({ category: 'UTILITY_BILLS', amountPkr: 8500, purpose: 'Electricity', paidTo: 'QESCO' }, owner())) as Record<string, unknown>;
    expect(expense.isOperatingExpense).toBe(true);
    expect(await CashMovement.countDocuments({ direction: 'OUT' })).toBe(1);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(-850000);
  });

  it('CRITICAL: a partner withdrawal is a cash outflow but NOT an operating expense', async () => {
    const partners = await listPartners();
    const partner = (partners as unknown as Array<Record<string, unknown>>)[0];
    await createPartnerTransaction(String(partner._id), { type: 'WITHDRAWAL', amountPkr: 25000 }, owner());

    const expenses = await ExpenseTransaction.find({}).lean();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe('PARTNER_WITHDRAWAL');
    expect(expenses[0].isOperatingExpense).toBe(false);

    const result = await listExpenses({ operatingOnly: true });
    expect(result.items).toHaveLength(0);
    expect(result.totals.operatingPaisa).toBe(0);
    expect(result.totals.totalPaisa).toBe(0);

    // ...but it is in total cash outflow
    const outflow = await CashMovement.aggregate([
      { $match: { direction: 'OUT' } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]);
    expect(outflow[0].total).toBe(2500000);
  });

  it('CRITICAL: customer advance cash is a cash outflow but NOT an operating expense', async () => {
    const { createAdvance } = await import('../../services/advance.service');
    const { createTestCustomer } = await import('../helpers');
    const created = await createTestCustomer({ tokenNumber: 60 });
    await createAdvance(
      { customerId: String((created.customer as unknown as { _id: unknown })._id), type: 'CASH', advanceDate: new Date(), amountPkr: 40000 },
      owner()
    );

    const all = await listExpenses({});
    expect(all.totals.totalPaisa).toBe(4000000);
    expect(all.totals.operatingPaisa).toBe(0);
    expect(all.totals.customerAdvancePaisa).toBe(4000000);
  });

  it('routes advance cash and partner withdrawals through their own modules', async () => {
    await expect(createExpense({ category: 'CUSTOMER_ADVANCE_CASH', amountPkr: 1000 }, owner())).rejects.toMatchObject({
      code: 'USE_ADVANCE_MODULE',
    });
    await expect(createExpense({ category: 'PARTNER_WITHDRAWAL', amountPkr: 1000 }, owner())).rejects.toMatchObject({
      code: 'USE_PARTNER_MODULE',
    });
  });

  it('reverses an expense, keeps the original record and restores the balance', async () => {
    const created = (await createExpense({ category: 'MAINTENANCE', amountPkr: 12000 }, owner())) as Record<string, unknown>;
    await reverseExpense(String(created._id), 'Wrong category entered', owner());

    const original = await ExpenseTransaction.findById(created._id).lean();
    expect(original!.status).toBe('reversed');
    expect(original!.reversalReason).toBe('Wrong category entered');

    const reversal = await ExpenseTransaction.findOne({ reversesExpense: created._id }).lean();
    expect(reversal!.amountPaisa).toBe(-1200000);
    expect(await ExpenseTransaction.countDocuments({})).toBe(2);
    expect((await FinancialAccount.findOne({ type: 'CASH' }).lean())!.balancePaisa).toBe(0);
  });

  it('summarises expenses by category, method and location', async () => {
    await createExpense({ category: 'DAILY_FOOD', amountPkr: 1000 }, owner());
    await createExpense({ category: 'TRAVELING', amountPkr: 2500, location: 'QUETTA' }, owner());
    await createExpense({ category: 'DAILY_FOOD', amountPkr: 500, method: 'BANK' }, owner());

    const byCategory = await listExpenses({ category: 'DAILY_FOOD' });
    expect(byCategory.totals.totalPaisa).toBe(150000);

    const quetta = await listExpenses({ location: 'QUETTA' });
    expect(quetta.items).toHaveLength(1);

    const bank = await listExpenses({ method: 'BANK' });
    expect(bank.items).toHaveLength(1);
  });

  /* ------------------------------------------------------------- partners --------- */

  it('seeds the three partner accounts with the names from the PRD', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    expect(partners.map((p) => p.name)).toEqual(['Irfan', 'Ghulam Muhammad', 'Hafiz Khalid']);
    expect(partners.map((p) => p.partnerCode)).toEqual(['P01', 'P02', 'P03']);
  });

  it('tracks withdrawals, contributions and repayments per partner with a net movement', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    const id = String(partners[0]._id);

    await createPartnerTransaction(id, { type: 'WITHDRAWAL', amountPkr: 20000 }, owner());
    await createPartnerTransaction(id, { type: 'WITHDRAWAL', amountPkr: 5000 }, owner());
    await createPartnerTransaction(id, { type: 'CONTRIBUTION', amountPkr: 100000 }, owner());
    await createPartnerTransaction(id, { type: 'REPAYMENT', amountPkr: 3000 }, owner());

    const statement = await listPartnerTransactions(id);
    expect(statement.items).toHaveLength(4);
    expect(statement.totals.withdrawn).toBe(2500000);
    expect(statement.totals.contributed).toBe(10000000);
    expect(statement.totals.repaid).toBe(300000);
    expect(statement.totals.net).toBe(10000000 + 300000 - 2500000);

    const partner = await Partner.findById(id).lean();
    expect(partner!.totalWithdrawnPaisa).toBe(2500000);
    expect(partner!.netCashPaisa).toBe(7800000);
  });

  it('gives each partner transaction a running balance in the ledger', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    const id = String(partners[1]._id);
    await createPartnerTransaction(id, { type: 'CONTRIBUTION', amountPkr: 50000 }, owner());
    await createPartnerTransaction(id, { type: 'WITHDRAWAL', amountPkr: 20000 }, owner());

    const statement = await listPartnerTransactions(id);
    const running = (statement.items as Array<Record<string, unknown>>).map((t) => t.runningBalancePaisa);
    expect(running).toEqual([5000000, 3000000]);
  });

  it('produces a combined partner withdrawal report', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    await createPartnerTransaction(String(partners[0]._id), { type: 'WITHDRAWAL', amountPkr: 10000 }, owner());
    await createPartnerTransaction(String(partners[1]._id), { type: 'WITHDRAWAL', amountPkr: 20000 }, owner());
    await createPartnerTransaction(String(partners[2]._id), { type: 'WITHDRAWAL', amountPkr: 30000 }, owner());

    const all = await PartnerTransaction.find({ type: 'WITHDRAWAL' }).lean();
    expect(all.reduce((s, t) => s + t.amountPaisa, 0)).toBe(6000000);
    const perPartner = await Partner.find({}).sort({ partnerCode: 1 }).lean();
    expect(perPartner.map((p) => p.totalWithdrawnPaisa)).toEqual([1000000, 2000000, 3000000]);
  });

  it('rejects a non-positive partner transaction amount', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    await expect(
      createPartnerTransaction(String(partners[0]._id), { type: 'WITHDRAWAL', amountPkr: 0 }, owner())
    ).rejects.toThrow();
  });

  it('recomputes partner balances from the ledger', async () => {
    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    const id = String(partners[2]._id);
    await createPartnerTransaction(id, { type: 'WITHDRAWAL', amountPkr: 7500 }, owner());
    await Partner.updateOne({ _id: id }, { $set: { totalWithdrawnPaisa: 0 } }); // simulate a stale cache
    const totals = await recalcPartnerBalances(id);
    expect(totals.withdrawn).toBe(750000);
  });

  /* ------------------------------------------- cash / bank / transfers / recon ----- */

  it('CRITICAL: a cash-to-bank transfer moves money without creating revenue or expense', async () => {
    await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 100000, method: 'CASH' }, owner());

    const cash = await accountId('CASH');
    const bank = await accountId('BANK');
    await createTransfer({ fromAccountId: cash, toAccountId: bank, amountPkr: 30000 }, owner());

    const cashAcc = await FinancialAccount.findById(cash).lean();
    const bankAcc = await FinancialAccount.findById(bank).lean();
    expect(cashAcc!.balancePaisa).toBe(7000000);
    expect(bankAcc!.balancePaisa).toBe(3000000);

    // No new income or expense records were created by the transfer
    expect(await IncomeTransaction.countDocuments({})).toBe(1);
    expect(await ExpenseTransaction.countDocuments({})).toBe(0);

    // Two movements, opposite directions
    const transfer = await Transfer.findOne({}).lean();
    const movements = await CashMovement.find({ transfer: transfer!._id }).lean();
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.direction).sort()).toEqual(['IN', 'OUT']);
  });

  it('refuses a transfer between the same account', async () => {
    const cash = await accountId('CASH');
    await expect(createTransfer({ fromAccountId: cash, toAccountId: cash, amountPkr: 100 }, owner())).rejects.toMatchObject({
      code: 'SAME_ACCOUNT',
    });
  });

  it('creates a new cash or bank account with an opening balance', async () => {
    const acc = (await createAccount({ name: 'Meezan Bank', type: 'BANK', bankName: 'Meezan', openingBalancePkr: 250000 }, owner())) as Record<string, unknown>;
    expect(acc.openingBalancePaisa).toBe(25000000);
    expect(acc.balancePaisa).toBe(25000000);
    const accounts = await FinancialAccount.find({}).lean();
    expect(accounts).toHaveLength(3);
  });

  it('records a daily closing with the calculated versus counted difference', async () => {
    await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 50000, method: 'CASH' }, owner());
    await createExpense({ category: 'DAILY_FOOD', amountPkr: 2000 }, owner());

    const cash = await accountId('CASH');
    const recon = (await createReconciliation(
      { accountId: cash, closingDate: new Date(), actualCountedPkr: 47500, notes: 'Counted at closing' },
      owner()
    )) as Record<string, unknown>;

    expect(recon.totalInPaisa).toBe(5000000);
    expect(recon.totalOutPaisa).toBe(200000);
    expect(recon.systemCalculatedPaisa).toBe(4800000);
    expect(recon.actualCountedPaisa).toBe(4750000);
    expect(recon.differencePaisa).toBe(50000); // 500 PKR short
    expect(await Reconciliation.countDocuments({})).toBe(1);
  });

  it('allows only one closing record per account per day', async () => {
    const cash = await accountId('CASH');
    await createReconciliation({ accountId: cash, closingDate: new Date(), actualCountedPkr: 0 }, owner());
    await expect(createReconciliation({ accountId: cash, closingDate: new Date(), actualCountedPkr: 0 }, owner())).rejects.toMatchObject({
      code: 'RECONCILIATION_EXISTS',
    });
  });

  it('prevents a duplicate cash movement from the same source transaction', async () => {
    const income = (await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 5000, method: 'CASH' }, owner())) as Record<string, unknown>;
    const cash = await accountId('CASH');

    const { recordMovement } = await import('../../services/cashMovement.service');
    await expect(
      recordMovement(
        {
          account: cash as unknown as never,
          direction: 'IN',
          amountPaisa: 500000,
          movementDate: new Date(),
          sourceType: 'INCOME',
          sourceRef: income._id as never,
        },
        null
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_MOVEMENT' });

    expect(await CashMovement.countDocuments({})).toBe(1);
  });

  /* ------------------------------------------------------------- dashboard -------- */

  it('reports revenue, collections, cash flow and balances from real records', async () => {
    const { createTestCustomer } = await import('../helpers');
    const { recordPayment } = await import('../../services/payment.service');
    const created = await createTestCustomer({ tokenNumber: 61, monthlyInstallmentPkr: 10000 });
    await recordPayment(
      { customerId: String((created.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: 10000 },
      owner()
    );
    await createIncome({ category: 'BUSINESS_REVENUE', amountPkr: 5000 }, owner());
    await createExpense({ category: 'UTILITY_BILLS', amountPkr: 1500 }, owner());

    const partners = (await listPartners()) as unknown as Array<Record<string, unknown>>;
    await createPartnerTransaction(String(partners[0]._id), { type: 'WITHDRAWAL', amountPkr: 2000 }, owner());

    const summary = await getDashboardSummary();
    expect(summary.tokens.total).toBe(120);
    expect(summary.tokens.assigned).toBe(1);
    expect(summary.customers.active).toBe(1);
    expect(summary.collections.today.paisa).toBe(1000000);
    expect(summary.operatingExpenses.today.paisa).toBe(150000);
    expect(summary.partnerWithdrawals.today.paisa).toBe(200000);
    // inflow = 10000 (collection) + 5000 (revenue); outflow = 1500 + 2000
    expect(summary.cashFlow.totalInflow.paisa).toBe(1500000);
    expect(summary.cashFlow.totalOutflow.paisa).toBe(350000);
    expect(summary.balances.cash.paisa).toBe(1500000 - 350000);
    expect(summary.recentTransactions.length).toBeGreaterThan(0);
    expect(summary.alerts.length).toBeGreaterThan(0);
  });

  it('splits collections by payment method and location in the income list', async () => {
    const { createTestCustomer } = await import('../helpers');
    const { recordPayment } = await import('../../services/payment.service');
    const a = await createTestCustomer({ tokenNumber: 62, monthlyInstallmentPkr: 10000, location: 'MACH' });
    const b = await createTestCustomer({ tokenNumber: 63, monthlyInstallmentPkr: 10000, location: 'QUETTA' });
    await recordPayment({ customerId: String((a.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: 10000, method: 'CASH' }, owner());
    await recordPayment({ customerId: String((b.customer as unknown as { _id: unknown })._id), monthNumbers: [1], amountPkr: 10000, method: 'BANK' }, owner());

    const cashOnly = await listIncome({ method: 'CASH' });
    expect(cashOnly.items).toHaveLength(1);
    expect(cashOnly.totals.totalPaisa).toBe(1000000);

    const quetta = await listIncome({ location: 'QUETTA' });
    expect(quetta.items).toHaveLength(1);
  });
});
