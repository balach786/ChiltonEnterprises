import { Request, Response } from 'express';
import { actor } from '../middleware/auth';
import {
  createAccount,
  createExpense,
  createIncome,
  createPartnerTransaction,
  createReconciliation,
  createTransfer,
  listAccounts,
  listCashMovements,
  listExpenses,
  listIncome,
  listPartnerTransactions,
  listPartners,
  listReconciliations,
  listTransfers,
  reverseExpense,
} from '../services/finance.service';
import { asyncHandler, ok, okPaginated } from '../utils/http';

/* income */
export const listIncomeController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listIncome(req.query as never);
  okPaginated(res, result.items, result.pagination, { totals: result.totals });
});

export const createIncomeController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createIncome(req.body, actor(req)), 201, 'Income recorded');
});

/* expenses */
export const listExpensesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listExpenses(req.query as never);
  okPaginated(res, result.items, result.pagination, { totals: result.totals });
});

export const createExpenseController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createExpense(req.body, actor(req)), 201, 'Expense recorded');
});

export const reverseExpenseController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await reverseExpense(req.params.id, req.body.reason, actor(req)), 200, 'Expense reversed');
});

/* partners */
export const listPartnersController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await listPartners());
});

export const partnerTransactionsController = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
  ok(
    res,
    await listPartnerTransactions(
      req.params.id,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined
    )
  );
});

export const createPartnerTransactionController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createPartnerTransaction(req.params.id, req.body, actor(req)), 201, 'Partner transaction recorded');
});

/* accounts, transfers, reconciliation */
export const listAccountsController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await listAccounts(req.query.includeInactive === 'true'));
});

export const createAccountController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createAccount(req.body, actor(req)), 201, 'Account created');
});

export const listCashMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listCashMovements(req.query as never);
  okPaginated(res, result.items, result.pagination);
});

export const createTransferController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createTransfer(req.body, actor(req)), 201, 'Transfer completed');
});

export const listTransfersController = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
  ok(res, await listTransfers(dateFrom ? new Date(dateFrom) : undefined, dateTo ? new Date(dateTo) : undefined));
});

export const createReconciliationController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await createReconciliation(req.body, actor(req)), 201, 'Daily closing recorded');
});

export const listReconciliationsController = asyncHandler(async (req: Request, res: Response) => {
  const { accountId, dateFrom, dateTo } = req.query as { accountId?: string; dateFrom?: string; dateTo?: string };
  ok(
    res,
    await listReconciliations(
      accountId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined
    )
  );
});
