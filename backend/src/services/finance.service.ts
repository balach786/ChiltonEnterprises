import { ClientSession, FilterQuery, Types } from 'mongoose';
import { PAYMENT_METHODS, PaymentMethod } from '../constants';
import {
  CashMovement,
  ExpenseTransaction,
  FinancialAccount,
  IncomeTransaction,
  nextSequence,
  Partner,
  PartnerTransaction,
  Reconciliation,
  Transfer,
} from '../models';
import { OPERATING_EXPENSE_CATEGORIES, REVENUE_INCOME_CATEGORIES } from '../constants';
import { ApiError } from '../utils/ApiError';
import { serializeMoney } from '../utils/serialize';
import { AuthUser } from '../types/express';
import { withTransaction } from '../db/mongo';
import { writeAudit } from './audit.service';
import { recordMovement } from './cashMovement.service';
import { endOfDay, startOfDay } from '../utils/money';
import { partnerCashEffect } from '../models/PartnerTransaction';

/* ------------------------------------------------------------------ income ---------- */

export interface CreateIncomeInput {
  category: string;
  amountPkr: number;
  transactionDate?: Date;
  method?: PaymentMethod;
  accountId?: string;
  customerId?: string;
  reference?: string;
  notes?: string;
}

/** Records non-installment income. Installment collections must go through /payments. */
export async function createIncome(input: CreateIncomeInput, user: AuthUser) {
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
    throw ApiError.badRequest('Amount must be greater than zero', 'INVALID_AMOUNT');
  }
  if (input.category === 'CUSTOMER_INSTALLMENT') {
    throw ApiError.badRequest(
      'Installment collections must be recorded through the payment workflow so they are linked to a receipt and a cash movement',
      'USE_PAYMENT_WORKFLOW'
    );
  }

  return withTransaction(async (session) => {
    const seq = await nextSequence('income');
    const account = await resolveAccount(input.accountId, input.method ?? 'CASH', session);
    const sourceType =
      input.category === 'PARTNER_CONTRIBUTION'
        ? 'PARTNER_CONTRIBUTION'
        : input.category === 'LOAN_OR_FUNDING'
          ? 'LOAN'
          : 'MANUAL';

    const income = new IncomeTransaction({
      transactionId: `INC-${String(seq).padStart(7, '0')}`,
      category: input.category,
      amountPaisa,
      method: input.method ?? 'CASH',
      account: account._id,
      accountName: account.name,
      transactionDate: input.transactionDate ? new Date(input.transactionDate) : new Date(),
      customer: input.customerId ? new Types.ObjectId(input.customerId) : undefined,
      reference: input.reference,
      notes: input.notes,
      // Funding is NEVER auto-classified as revenue (PRD p.10 / p.13).
      isRevenue: REVENUE_INCOME_CATEGORIES.includes(input.category as never),
      sourceType,
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await income.save({ session });
    else await income.save();

    const movement = await recordMovement(
      {
        account: account._id,
        direction: 'IN',
        amountPaisa,
        movementDate: income.transactionDate,
        sourceType: 'INCOME',
        sourceRef: income._id,
        description: `${input.category} income`,
        reference: income.transactionId,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );
    income.cashMovement = movement._id;
    if (session) await income.save({ session });
    else await income.save();

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'IncomeTransaction',
        entityId: String(income._id),
        description: `Recorded ${input.category} income of ${amountPaisa / 100} PKR`,
        newValue: { category: input.category, amountPaisa, isRevenue: income.isRevenue },
        reason: 'Income entry',
      },
      session
    );

    return serializeMoney(income);
  });
}

export interface IncomeQuery {
  category?: string;
  location?: 'MACH' | 'QUETTA';
  method?: string;
  dateFrom?: Date;
  dateTo?: Date;
  revenueOnly?: boolean;
  customerId?: string;
  page?: number;
  limit?: number;
}

export async function listIncome(query: IncomeQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const filter: FilterQuery<unknown> = { status: 'posted' };
  if (query.category) filter.category = query.category;
  if (query.location) filter.location = query.location;
  if (query.method) filter.method = query.method;
  if (query.revenueOnly) filter.isRevenue = true;
  if (query.customerId) filter.customer = new Types.ObjectId(query.customerId);
  if (query.dateFrom || query.dateTo) {
    filter.transactionDate = {};
    if (query.dateFrom) filter.transactionDate.$gte = query.dateFrom;
    if (query.dateTo) filter.transactionDate.$lte = query.dateTo;
  }

  const [items, total] = await Promise.all([
    IncomeTransaction.find(filter)
      .sort({ transactionDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name cnic phone location')
      .lean(),
    IncomeTransaction.countDocuments(filter),
  ]);

  const agg = await IncomeTransaction.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amountPaisa' }, revenue: { $sum: { $cond: ['$isRevenue', '$amountPaisa', 0] } } } }]);
  return {
    items: serializeMoney(items),
    pagination: { page, limit, total },
    totals: { totalPaisa: agg[0]?.total ?? 0, revenuePaisa: agg[0]?.revenue ?? 0 },
  };
}

/* ----------------------------------------------------------------- expenses ---------- */

export interface CreateExpenseInput {
  category: string;
  subCategory?: string;
  amountPkr: number;
  transactionDate?: Date;
  method?: PaymentMethod;
  accountId?: string;
  paidTo?: string;
  partnerId?: string;
  customerId?: string;
  location?: 'MACH' | 'QUETTA';
  purpose?: string;
}

/**
 * Records an expense. Customer advance cash and partner withdrawals are routed through
 * their own modules; recording them here is rejected so a cash outflow can never be
 * created twice for the same event.
 */
export async function createExpense(input: CreateExpenseInput, user: AuthUser) {
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
    throw ApiError.badRequest('Amount must be greater than zero', 'INVALID_AMOUNT');
  }
  if (input.category === 'CUSTOMER_ADVANCE_CASH') {
    throw ApiError.badRequest(
      'Customer advance cash must be recorded through the Advance Cash module so it links to the advance case',
      'USE_ADVANCE_MODULE'
    );
  }
  if (input.category === 'PARTNER_WITHDRAWAL') {
    throw ApiError.badRequest(
      'Partner withdrawals must be recorded through the Partner Accounts module so they stay out of operating expenses',
      'USE_PARTNER_MODULE'
    );
  }

  return withTransaction(async (session) => {
    const seq = await nextSequence('expense');
    const account = await resolveAccount(input.accountId, input.method ?? 'CASH', session);

    const expense = new ExpenseTransaction({
      transactionId: `EXP-${String(seq).padStart(7, '0')}`,
      category: input.category,
      subCategory: input.subCategory,
      amountPaisa,
      isOperatingExpense: OPERATING_EXPENSE_CATEGORIES.includes(input.category as never),
      method: input.method ?? 'CASH',
      account: account._id,
      accountName: account.name,
      transactionDate: input.transactionDate ? new Date(input.transactionDate) : new Date(),
      paidTo: input.paidTo,
      partner: input.partnerId ? new Types.ObjectId(input.partnerId) : undefined,
      customer: input.customerId ? new Types.ObjectId(input.customerId) : undefined,
      location: input.location,
      purpose: input.purpose,
      sourceType: 'MANUAL',
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await expense.save({ session });
    else await expense.save();

    const movement = await recordMovement(
      {
        account: account._id,
        direction: 'OUT',
        amountPaisa,
        movementDate: expense.transactionDate,
        sourceType: 'EXPENSE',
        sourceRef: expense._id,
        description: `${input.category} expense`,
        reference: expense.transactionId,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );
    expense.cashMovement = movement._id;
    if (session) await expense.save({ session });
    else await expense.save();

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'ExpenseTransaction',
        entityId: String(expense._id),
        description: `Recorded ${input.category} expense of ${amountPaisa / 100} PKR`,
        newValue: { category: input.category, amountPaisa, isOperatingExpense: expense.isOperatingExpense },
        reason: input.purpose ?? 'Expense entry',
      },
      session
    );

    return serializeMoney(expense);
  });
}

export async function reverseExpense(expenseId: string, reason: string, user: AuthUser) {
  if (!reason?.trim()) throw ApiError.badRequest('A reason is required', 'REASON_REQUIRED');
  if (!Types.ObjectId.isValid(expenseId)) throw ApiError.notFound('Expense');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const original = await ExpenseTransaction.findById(expenseId).session(session ?? null).lean();
    if (!original) throw ApiError.notFound('Expense');
    if (original.status === 'reversed') throw ApiError.conflict('Already reversed', 'ALREADY_REVERSED');

    const seq = await nextSequence('expense');
    const reversal = new ExpenseTransaction({
      transactionId: `EXP-REV-${String(seq).padStart(7, '0')}`,
      category: original.category,
      subCategory: original.subCategory,
      amountPaisa: -original.amountPaisa,
      isOperatingExpense: original.isOperatingExpense,
      method: original.method,
      account: original.account,
      accountName: original.accountName,
      transactionDate: new Date(),
      paidTo: original.paidTo,
      partner: original.partner,
      customer: original.customer,
      purpose: `Reversal: ${reason}`,
      sourceType: 'REVERSAL',
      sourceRef: original._id,
      enteredBy: user.id,
      enteredByName: user.name,
      reversesExpense: original._id,
    });
    if (session) await reversal.save({ session });
    else await reversal.save();

    await ExpenseTransaction.updateOne(
      { _id: original._id },
      { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } },
      opts
    );

    if (original.account) {
      const movement = await recordMovement(
        {
          account: original.account,
          direction: 'IN',
          amountPaisa: original.amountPaisa,
          movementDate: new Date(),
          sourceType: 'EXPENSE',
          sourceRef: reversal._id,
          description: `Reversal of ${original.transactionId}`,
          reference: original.transactionId,
          enteredBy: user.id,
          enteredByName: user.name,
        },
        session
      );
      reversal.cashMovement = movement._id;
      if (session) await reversal.save({ session });
      else await reversal.save();
    }

    await writeAudit(
      {
        actor: user,
        action: 'REVERSAL',
        entityType: 'ExpenseTransaction',
        entityId: String(original._id),
        description: `Reversed expense ${original.transactionId}`,
        previousValue: { status: 'posted', amountPaisa: original.amountPaisa },
        newValue: { status: 'reversed' },
        reason,
      },
      session
    );

    return serializeMoney({ original, reversal });
  });
}

export interface ExpenseQuery {
  category?: string;
  subCategory?: string;
  location?: 'MACH' | 'QUETTA';
  method?: string;
  partnerId?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  operatingOnly?: boolean;
  page?: number;
  limit?: number;
}

export async function listExpenses(query: ExpenseQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const filter: FilterQuery<unknown> = { status: 'posted' };
  if (query.category) filter.category = query.category;
  if (query.subCategory) filter.subCategory = query.subCategory;
  if (query.location) filter.location = query.location;
  if (query.method) filter.method = query.method;
  if (query.partnerId) filter.partner = new Types.ObjectId(query.partnerId);
  if (query.customerId) filter.customer = new Types.ObjectId(query.customerId);
  if (query.operatingOnly) filter.isOperatingExpense = true;
  if (query.dateFrom || query.dateTo) {
    filter.transactionDate = {};
    if (query.dateFrom) filter.transactionDate.$gte = query.dateFrom;
    if (query.dateTo) filter.transactionDate.$lte = query.dateTo;
  }

  const [items, total] = await Promise.all([
    ExpenseTransaction.find(filter)
      .sort({ transactionDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name location')
      .populate('partner', 'name partnerCode')
      .lean(),
    ExpenseTransaction.countDocuments(filter),
  ]);

  const agg = await ExpenseTransaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: '$amountPaisa' },
        operating: { $sum: { $cond: ['$isOperatingExpense', '$amountPaisa', 0] } },
        advances: { $sum: { $cond: [{ $eq: ['$category', 'CUSTOMER_ADVANCE_CASH'] }, '$amountPaisa', 0] } },
      },
    },
  ]);

  return {
    items: serializeMoney(items),
    pagination: { page, limit, total },
    totals: {
      totalPaisa: agg[0]?.total ?? 0,
      operatingPaisa: agg[0]?.operating ?? 0,
      customerAdvancePaisa: agg[0]?.advances ?? 0,
    },
  };
}

/* ----------------------------------------------------------------- partners ---------- */

export interface PartnerTxnInput {
  type: 'WITHDRAWAL' | 'CONTRIBUTION' | 'REPAYMENT' | 'CORRECTION';
  amountPkr: number;
  transactionDate?: Date;
  method?: PaymentMethod;
  accountId?: string;
  purpose?: string;
  reference?: string;
}

/**
 * Records a partner transaction (PRD section 10).
 *  - withdrawals reduce the cash/bank balance and count in total cash outflow, but are
 *    never added to operating expense totals;
 *  - contributions increase cash inflow and are never classified as revenue.
 */
export async function createPartnerTransaction(partnerId: string, input: PartnerTxnInput, user: AuthUser) {
  if (!Types.ObjectId.isValid(partnerId)) throw ApiError.notFound('Partner');
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
    throw ApiError.badRequest('Amount must be greater than zero', 'INVALID_AMOUNT');
  }
  if (!PAYMENT_METHODS.includes(input.method ?? 'CASH')) throw ApiError.badRequest('Invalid payment method');

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const partner = await Partner.findById(partnerId).session(session ?? null).lean();
    if (!partner) throw ApiError.notFound('Partner');

    const seq = await nextSequence('partnerTxn');
    const cashEffect = partnerCashEffect(input.type, amountPaisa);
    const account = await resolveAccount(input.accountId, input.method ?? 'CASH', session);

    const txn = new PartnerTransaction({
      transactionId: `PTX-${String(seq).padStart(7, '0')}`,
      partner: partner._id,
      partnerName: partner.name,
      type: input.type,
      amountPaisa,
      cashEffectPaisa: cashEffect,
      method: input.method ?? 'CASH',
      account: account._id,
      accountName: account.name,
      transactionDate: input.transactionDate ? new Date(input.transactionDate) : new Date(),
      purpose: input.purpose,
      reference: input.reference,
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await txn.save({ session });
    else await txn.save();

    // Cash movement: withdrawal = OUT, contribution/repayment = IN.
    const movement = await recordMovement(
      {
        account: account._id,
        direction: cashEffect >= 0 ? 'IN' : 'OUT',
        amountPaisa,
        movementDate: txn.transactionDate,
        sourceType: 'PARTNER_TXN',
        sourceRef: txn._id,
        description: `${partner.name} - ${input.type.toLowerCase()}`,
        reference: txn.transactionId,
        partner: partner._id,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );
    txn.cashMovement = movement._id;

    // Withdrawals mirror into the expense ledger with isOperatingExpense = false so that
    // they appear in cash-outflow reporting but never in operating expense totals.
    if (input.type === 'WITHDRAWAL') {
      const expenseSeq = await nextSequence('expense');
      const expense = new ExpenseTransaction({
        transactionId: `EXP-${String(expenseSeq).padStart(7, '0')}`,
        category: 'PARTNER_WITHDRAWAL',
        amountPaisa,
        isOperatingExpense: false,
        method: txn.method,
        account: account._id,
        accountName: account.name,
        transactionDate: txn.transactionDate,
        paidTo: partner.name,
        partner: partner._id,
        purpose: input.purpose ?? 'Partner withdrawal',
        sourceType: 'PARTNER_WITHDRAWAL',
        sourceRef: txn._id,
        enteredBy: user.id,
        enteredByName: user.name,
        cashMovement: movement._id,
      });
      if (session) await expense.save({ session });
      else await expense.save();
      txn.expenseTransaction = expense._id;
    } else if (input.type === 'CONTRIBUTION' || input.type === 'REPAYMENT') {
      const incomeSeq = await nextSequence('income');
      const income = new IncomeTransaction({
        transactionId: `INC-${String(incomeSeq).padStart(7, '0')}`,
        category: input.type === 'CONTRIBUTION' ? 'PARTNER_CONTRIBUTION' : 'OTHER',
        amountPaisa,
        method: txn.method,
        account: account._id,
        accountName: account.name,
        transactionDate: txn.transactionDate,
        reference: txn.transactionId,
        notes: `${partner.name} - ${input.type.toLowerCase()}`,
        // Funding, never revenue.
        isRevenue: false,
        sourceType: input.type === 'CONTRIBUTION' ? 'PARTNER_CONTRIBUTION' : 'MANUAL',
        enteredBy: user.id,
        enteredByName: user.name,
        cashMovement: movement._id,
      });
      if (session) await income.save({ session });
      else await income.save();
      txn.incomeTransaction = income._id;
    }

    if (session) await txn.save({ session });
    else await txn.save();

    await recalcPartnerBalances(partner._id, session);

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'PartnerTransaction',
        entityId: String(txn._id),
        description: `Recorded ${input.type.toLowerCase()} of ${amountPaisa / 100} PKR for ${partner.name}`,
        newValue: { type: input.type, amountPaisa, cashEffectPaisa: cashEffect },
        reason: input.purpose ?? 'Partner transaction',
      },
      session
    );

    return serializeMoney(txn);
  });
}

/** Recomputes the cached partner totals from the posted transaction ledger. */
export async function recalcPartnerBalances(partnerId: Types.ObjectId | string, session: ClientSession | null = null) {
  const opts = session ? { session } : {};
  const [agg] = await PartnerTransaction.aggregate([
    { $match: { partner: new Types.ObjectId(String(partnerId)), status: 'posted' } },
    {
      $group: {
        _id: null,
        withdrawn: { $sum: { $cond: [{ $eq: ['$type', 'WITHDRAWAL'] }, '$amountPaisa', 0] } },
        contributed: { $sum: { $cond: [{ $eq: ['$type', 'CONTRIBUTION'] }, '$amountPaisa', 0] } },
        repaid: { $sum: { $cond: [{ $eq: ['$type', 'REPAYMENT'] }, '$amountPaisa', 0] } },
      },
    },
  ]).session(session ?? null);

  const withdrawn = agg?.withdrawn ?? 0;
  const contributed = agg?.contributed ?? 0;
  const repaid = agg?.repaid ?? 0;

  await Partner.updateOne(
    { _id: partnerId },
    {
      $set: {
        totalWithdrawnPaisa: withdrawn,
        totalContributedPaisa: contributed,
        totalRepaidPaisa: repaid,
        netCashPaisa: contributed + repaid - withdrawn,
      },
    },
    opts
  );
  return { withdrawn, contributed, repaid, net: contributed + repaid - withdrawn };
}

export async function listPartners() {
  const partners = await Partner.find({}).sort({ partnerCode: 1 }).lean();
  return serializeMoney(partners);
}

export async function listPartnerTransactions(partnerId: string, dateFrom?: Date, dateTo?: Date) {
  if (!Types.ObjectId.isValid(partnerId)) throw ApiError.notFound('Partner');
  const partner = await Partner.findById(partnerId).lean();
  if (!partner) throw ApiError.notFound('Partner');

  const filter: FilterQuery<unknown> = { partner: partner._id };
  if (dateFrom || dateTo) {
    filter.transactionDate = {};
    if (dateFrom) filter.transactionDate.$gte = dateFrom;
    if (dateTo) filter.transactionDate.$lte = dateTo;
  }

  const txns = await PartnerTransaction.find(filter).sort({ transactionDate: 1, createdAt: 1 }).lean();

  // Running balance (net cash position contributed to the shop).
  let running = partner.openingBalancePaisa;
  const rows = txns.map((t) => {
    running += t.cashEffectPaisa;
    return { ...serializeMoney<Record<string, unknown>>(t), runningBalancePaisa: running };
  });

  const totals = await recalcPartnerBalances(partner._id);
  return { partner: serializeMoney(partner), items: rows, totals };
}

/* ----------------------------------------------------- accounts / transfers / recon --- */

async function resolveAccount(accountId: string | undefined, method: PaymentMethod, session: ClientSession | null) {
  if (accountId) {
    if (!Types.ObjectId.isValid(accountId)) throw ApiError.badRequest('Invalid account id', 'INVALID_ACCOUNT');
    const acc = await FinancialAccount.findById(accountId).session(session ?? null).lean();
    if (!acc) throw ApiError.notFound('Financial account');
    return acc;
  }
  const type = method === 'BANK' || method === 'ONLINE' || method === 'CHEQUE' ? 'BANK' : 'CASH';
  const acc =
    (await FinancialAccount.findOne({ type, isDefault: true, isActive: true }).session(session ?? null).lean()) ??
    (await FinancialAccount.findOne({ type, isActive: true }).session(session ?? null).lean());
  if (!acc) {
    throw ApiError.badRequest(`No active ${type} account is configured`, 'NO_DEFAULT_ACCOUNT');
  }
  return acc;
}

export interface CreateAccountInput {
  name: string;
  type: 'CASH' | 'BANK';
  bankName?: string;
  accountNumber?: string;
  openingBalancePkr?: number;
  isDefault?: boolean;
  location?: 'MACH' | 'QUETTA' | 'ALL';
  notes?: string;
}

export async function createAccount(input: CreateAccountInput, user: AuthUser) {
  if (!input.name?.trim()) throw ApiError.badRequest('Account name is required');
  const openingBalancePaisa = Math.round((input.openingBalancePkr ?? 0) * 100);

  if (input.isDefault) {
    await FinancialAccount.updateMany({ type: input.type, isDefault: true }, { $set: { isDefault: false } });
  }
  const seq = await nextSequence('account');
  const account = await FinancialAccount.create({
    code: `ACC-${String(seq).padStart(4, '0')}`,
    name: input.name.trim(),
    type: input.type,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    openingBalancePaisa,
    balancePaisa: openingBalancePaisa,
    isDefault: Boolean(input.isDefault),
    location: input.location ?? 'ALL',
    notes: input.notes,
    createdBy: user.id,
  });

  await writeAudit({
    actor: user,
    action: 'CREATE',
    entityType: 'FinancialAccount',
    entityId: String(account._id),
    description: `Created ${input.type} account ${account.name} with opening balance ${openingBalancePaisa / 100} PKR`,
    newValue: { name: account.name, type: account.type, openingBalancePaisa },
    reason: 'Account setup',
  });

  return serializeMoney(account);
}

export async function listAccounts(includeInactive = false) {
  const accounts = await FinancialAccount.find(includeInactive ? {} : { isActive: true })
    .sort({ type: 1, name: 1 })
    .lean();
  return serializeMoney(accounts);
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amountPkr: number;
  transferDate?: Date;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
}

/**
 * Cash <-> bank transfer. Creates two opposing movements and no revenue or expense
 * (PRD p.13).
 */
export async function createTransfer(input: TransferInput, user: AuthUser) {
  if (!Types.ObjectId.isValid(input.fromAccountId) || !Types.ObjectId.isValid(input.toAccountId)) {
    throw ApiError.badRequest('Invalid account id', 'INVALID_ACCOUNT');
  }
  if (String(input.fromAccountId) === String(input.toAccountId)) {
    throw ApiError.badRequest('Source and destination accounts must differ', 'SAME_ACCOUNT');
  }
  const amountPaisa = Math.round(Number(input.amountPkr) * 100);
  if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
    throw ApiError.badRequest('Transfer amount must be greater than zero', 'INVALID_AMOUNT');
  }

  return withTransaction(async (session) => {
    const from = await FinancialAccount.findById(input.fromAccountId).session(session ?? null).lean();
    const to = await FinancialAccount.findById(input.toAccountId).session(session ?? null).lean();
    if (!from || !to) throw ApiError.notFound('Financial account');

    const seq = await nextSequence('transfer');
    const transfer = new Transfer({
      transferId: `TRF-${String(seq).padStart(6, '0')}`,
      fromAccount: from._id,
      fromAccountName: from.name,
      toAccount: to._id,
      toAccountName: to.name,
      amountPaisa,
      transferDate: input.transferDate ? new Date(input.transferDate) : new Date(),
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      enteredBy: user.id,
      enteredByName: user.name,
    });
    if (session) await transfer.save({ session });
    else await transfer.save();

    const out = await recordMovement(
      {
        account: from._id,
        direction: 'OUT',
        amountPaisa,
        movementDate: transfer.transferDate,
        sourceType: 'TRANSFER',
        sourceRef: transfer._id,
        transfer: transfer._id,
        counterpartAccount: to._id,
        description: `Transfer to ${to.name}`,
        reference: transfer.transferId,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );
    const inn = await recordMovement(
      {
        account: to._id,
        direction: 'IN',
        amountPaisa,
        movementDate: transfer.transferDate,
        sourceType: 'TRANSFER',
        sourceRef: transfer._id,
        transfer: transfer._id,
        counterpartAccount: from._id,
        description: `Transfer from ${from.name}`,
        reference: transfer.transferId,
        enteredBy: user.id,
        enteredByName: user.name,
      },
      session
    );

    transfer.outMovement = out._id;
    transfer.inMovement = inn._id;
    if (session) await transfer.save({ session });
    else await transfer.save();

    await writeAudit(
      {
        actor: user,
        action: 'CREATE',
        entityType: 'Transfer',
        entityId: String(transfer._id),
        description: `Transferred ${amountPaisa / 100} PKR from ${from.name} to ${to.name}`,
        newValue: { from: from.name, to: to.name, amountPaisa },
        reason: input.notes ?? 'Internal transfer',
      },
      session
    );

    return serializeMoney(transfer);
  });
}

export interface ReconciliationInput {
  accountId: string;
  closingDate: Date;
  actualCountedPkr: number;
  notes?: string;
  status?: 'OPEN' | 'APPROVED';
}

/**
 * Daily closing: Closing = Opening + inflows - outflows. The difference against the
 * physically counted amount is stored for review (PRD p.13).
 */
export async function createReconciliation(input: ReconciliationInput, user: AuthUser) {
  if (!Types.ObjectId.isValid(input.accountId)) throw ApiError.badRequest('Invalid account id');
  const account = await FinancialAccount.findById(input.accountId).lean();
  if (!account) throw ApiError.notFound('Financial account');

  const dayStart = startOfDay(new Date(input.closingDate));
  const dayEnd = endOfDay(new Date(input.closingDate));

  const [agg] = await CashMovementAgg(account._id, dayStart, dayEnd);
  const systemCalculated = account.openingBalancePaisa + (agg?.inflow ?? 0) - (agg?.outflow ?? 0);
  const actualCounted = Math.round(Number(input.actualCountedPkr) * 100);
  if (!Number.isFinite(actualCounted)) throw ApiError.badRequest('Invalid counted amount');

  const existing = await Reconciliation.findOne({ account: account._id, closingDate: dayStart }).lean();
  if (existing) {
    throw ApiError.conflict(
      `A closing record already exists for ${account.name} on ${dayStart.toISOString().slice(0, 10)}`,
      'RECONCILIATION_EXISTS'
    );
  }

  const doc = await Reconciliation.create({
    account: account._id,
    accountName: account.name,
    accountType: account.type,
    closingDate: dayStart,
    openingBalancePaisa: account.openingBalancePaisa,
    totalInPaisa: agg?.inflow ?? 0,
    totalOutPaisa: agg?.outflow ?? 0,
    systemCalculatedPaisa: systemCalculated,
    actualCountedPaisa: actualCounted,
    differencePaisa: systemCalculated - actualCounted,
    notes: input.notes,
    status: input.status ?? 'OPEN',
    enteredBy: user.id,
    enteredByName: user.name,
    approvedBy: input.status === 'APPROVED' ? user.id : undefined,
    approvedByName: input.status === 'APPROVED' ? user.name : undefined,
    approvedAt: input.status === 'APPROVED' ? new Date() : undefined,
  });

  await writeAudit({
    actor: user,
    action: 'RECONCILE',
    entityType: 'Reconciliation',
    entityId: String(doc._id),
    description: `Closed ${account.name} on ${dayStart.toISOString().slice(0, 10)} - difference ${(systemCalculated - actualCounted) / 100} PKR`,
    newValue: { systemCalculatedPaisa: systemCalculated, actualCountedPaisa: actualCounted },
    reason: input.notes ?? 'Daily closing',
  });

  return serializeMoney(doc);
}

/** Day-range inflow/outflow totals for one account (used by daily closing). */
export function CashMovementAgg(accountId: Types.ObjectId, from: Date, to: Date) {
  return CashMovement.aggregate([
    { $match: { account: accountId, movementDate: { $gte: from, $lte: to }, status: 'posted' } },
    {
      $group: {
        _id: null,
        inflow: { $sum: { $cond: [{ $eq: ['$direction', 'IN'] }, '$amountPaisa', 0] } },
        outflow: { $sum: { $cond: [{ $eq: ['$direction', 'OUT'] }, '$amountPaisa', 0] } },
      },
    },
  ]) as Promise<Array<{ inflow: number; outflow: number }>>;
}

export function closingBalance(opening: number, inflow: number, outflow: number): number {
  return opening + inflow - outflow;
}

export async function listCashMovements(query: {
  accountId?: string;
  direction?: 'IN' | 'OUT';
  sourceType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const filter: FilterQuery<unknown> = { status: 'posted' };
  if (query.accountId) filter.account = new Types.ObjectId(query.accountId);
  if (query.direction) filter.direction = query.direction;
  if (query.sourceType) filter.sourceType = query.sourceType;
  if (query.dateFrom || query.dateTo) {
    filter.movementDate = {};
    if (query.dateFrom) filter.movementDate.$gte = query.dateFrom;
    if (query.dateTo) filter.movementDate.$lte = query.dateTo;
  }
  const [items, total] = await Promise.all([
    CashMovement.find(filter)
      .sort({ movementDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CashMovement.countDocuments(filter),
  ]);
  return { items: serializeMoney(items), pagination: { page, limit, total } };
}

export async function listReconciliations(accountId?: string, dateFrom?: Date, dateTo?: Date) {
  const filter: FilterQuery<unknown> = {};
  if (accountId) filter.account = new Types.ObjectId(accountId);
  if (dateFrom || dateTo) {
    filter.closingDate = {};
    if (dateFrom) filter.closingDate.$gte = dateFrom;
    if (dateTo) filter.closingDate.$lte = dateTo;
  }
  const items = await Reconciliation.find(filter).sort({ closingDate: -1 }).lean();
  return serializeMoney(items);
}

export async function listTransfers(dateFrom?: Date, dateTo?: Date) {
  const filter: FilterQuery<unknown> = {};
  if (dateFrom || dateTo) {
    filter.transferDate = {};
    if (dateFrom) filter.transferDate.$gte = dateFrom;
    if (dateTo) filter.transferDate.$lte = dateTo;
  }
  const items = await Transfer.find(filter).sort({ transferDate: -1 }).lean();
  return serializeMoney(items);
}
