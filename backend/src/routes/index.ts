import { Router } from 'express';
import { PERMISSIONS } from '../constants/permissions';
import { requireAuth, requirePermission } from '../middleware/auth';
import { validate } from '../utils/http';
import { exportLimiter } from '../middleware/rateLimiters';

import authRoutes from './auth.routes';
import {
  createCustomerController,
  customerStatementController,
  getCustomerController,
  listCustomersController,
  tokensController,
  updateCustomerController,
} from '../controllers/customer.controller';
import {
  adjustInstallmentController,
  allocateCreditController,
  creditController,
  customerInstallmentsController,
  listInstallmentsController,
  listPaymentsController,
  paymentTrailController,
  receiptController,
  recordPaymentController,
  reversePaymentController,
} from '../controllers/payment.controller';
import {
  confirmDrawController,
  correctDrawController,
  createDrawController,
  eligibleController,
  getDrawController,
  listDrawsController,
  voidDrawController,
} from '../controllers/draw.controller';
import {
  createAdvanceController,
  getAdvanceController,
  listAdvancesController,
  updateAdvanceController,
} from '../controllers/advance.controller';
import {
  createAccountController,
  createExpenseController,
  createIncomeController,
  createPartnerTransactionController,
  createReconciliationController,
  createTransferController,
  listAccountsController,
  listCashMovementsController,
  listExpensesController,
  listIncomeController,
  partnerTransactionsController,
  listPartnersController,
  listReconciliationsController,
  listTransfersController,
  reverseExpenseController,
} from '../controllers/finance.controller';
import {
  activeCollectionListController,
  advanceBikeListController,
  advanceCashListController,
  dashboardCashPositionController,
  dashboardCollectionsController,
  dashboardExpensesController,
  dashboardSummaryController,
  drawnClosedListController,
  drawEligibleListController,
  machListController,
  overduePartialListController,
  quettaListController,
  tokenRegisterListController,
} from '../controllers/list.controller';
import {
  customerStatementReportController,
  reportCatalogController,
  reportController,
  reportPreviewController,
} from '../controllers/report.controller';
import {
  exportArchiveController,
  healthController,
  initTokensController,
  listBackupsController,
  settingsMetaController,
  updateSettingsController,
} from '../controllers/settings.controller';
import { getSettingsController } from '../controllers/settings.controller';
import {
  adjustInstallmentSchema,
  advanceListSchema,
  allocateCreditSchema,
  auditQuerySchema,
  cashMovementListSchema,
  createAccountSchema,
  createAdvanceSchema,
  createCustomerSchema,
  createDrawSchema,
  createExpenseSchema,
  createIncomeSchema,
  correctDrawSchema,
  customerListSchema,
  dashboardQuerySchema,
  drawListSchema,
  eligibleSchema,
  expenseListSchema,
  incomeListSchema,
  installmentListSchema,
  listQuerySchema,
  partnerTxnListSchema,
  partnerTxnSchema,
  paymentListSchema,
  reconciliationSchema,
  recordPaymentSchema,
  reportQuerySchema,
  reverseExpenseSchema,
  reversePaymentSchema,
  tokenListSchema,
  transferSchema,
  updateAdvanceSchema,
  updateCustomerSchema,
  updateSettingsSchema,
  voidDrawSchema,
} from '../validators';

const router = Router();

router.get('/health', healthController);
router.use('/auth', authRoutes);

/* everything below requires authentication */
router.use(requireAuth);

/* ------------------------------------------------------------------ dashboard ------ */
router.get('/dashboard/summary', requirePermission(PERMISSIONS.DASHBOARD_VIEW), validate(dashboardQuerySchema, 'query'), dashboardSummaryController);
router.get('/dashboard/collections', requirePermission(PERMISSIONS.DASHBOARD_VIEW), validate(dashboardQuerySchema, 'query'), dashboardCollectionsController);
router.get('/dashboard/expenses', requirePermission(PERMISSIONS.DASHBOARD_VIEW), validate(dashboardQuerySchema, 'query'), dashboardExpensesController);
router.get('/dashboard/cash-position', requirePermission(PERMISSIONS.DASHBOARD_VIEW), validate(dashboardQuerySchema, 'query'), dashboardCashPositionController);

/* ------------------------------------------------------- customers and tokens ------ */
router.get('/customers', requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(customerListSchema, 'query'), listCustomersController);
router.post('/customers', requirePermission(PERMISSIONS.CUSTOMER_CREATE), validate(createCustomerSchema), createCustomerController);
router.get('/customers/:id', requirePermission(PERMISSIONS.CUSTOMER_VIEW), getCustomerController);
router.patch('/customers/:id', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validate(updateCustomerSchema), updateCustomerController);
router.get('/customers/:id/statement', requirePermission(PERMISSIONS.CUSTOMER_VIEW), customerStatementController);
router.get('/customers/:id/credit', requirePermission(PERMISSIONS.PAYMENT_VIEW), creditController);
router.get('/tokens', requirePermission(PERMISSIONS.TOKEN_VIEW), validate(tokenListSchema, 'query'), tokensController);
router.post('/tokens/init', requirePermission(PERMISSIONS.SETTINGS_UPDATE), initTokensController);

/* ------------------------------------------------- installments and payments ------- */
router.get('/installments', requirePermission(PERMISSIONS.INSTALLMENT_VIEW), validate(installmentListSchema, 'query'), listInstallmentsController);
router.get('/installments/customer/:customerId', requirePermission(PERMISSIONS.INSTALLMENT_VIEW), customerInstallmentsController);
router.post('/installments/adjust', requirePermission(PERMISSIONS.PAYMENT_REVERSE), validate(adjustInstallmentSchema), adjustInstallmentController);

router.get('/payments', requirePermission(PERMISSIONS.PAYMENT_VIEW), validate(paymentListSchema, 'query'), listPaymentsController);
router.post('/payments', requirePermission(PERMISSIONS.PAYMENT_CREATE), validate(recordPaymentSchema), recordPaymentController);
router.post('/payments/:id/reverse', requirePermission(PERMISSIONS.PAYMENT_REVERSE), validate(reversePaymentSchema), reversePaymentController);
router.get('/payments/:id/trail', requirePermission(PERMISSIONS.PAYMENT_VIEW), paymentTrailController);
router.post('/payments/allocate-credit', requirePermission(PERMISSIONS.PAYMENT_CREATE), validate(allocateCreditSchema), allocateCreditController);
router.get('/receipts/:id', requirePermission(PERMISSIONS.RECEIPT_VIEW), receiptController);

/* --------------------------------------------------------------------- draws ------- */
router.get('/draws/eligible', requirePermission(PERMISSIONS.DRAW_VIEW), validate(eligibleSchema, 'query'), eligibleController);
router.get('/draws', requirePermission(PERMISSIONS.DRAW_VIEW), validate(drawListSchema, 'query'), listDrawsController);
router.post('/draws', requirePermission(PERMISSIONS.DRAW_CREATE), validate(createDrawSchema), createDrawController);
router.get('/draws/:id', requirePermission(PERMISSIONS.DRAW_VIEW), getDrawController);
router.post('/draws/:id/confirm', requirePermission(PERMISSIONS.DRAW_CONFIRM), confirmDrawController);
router.post('/draws/:id/correct', requirePermission(PERMISSIONS.DRAW_CORRECT), validate(correctDrawSchema), correctDrawController);
router.post('/draws/:id/void', requirePermission(PERMISSIONS.DRAW_CORRECT), validate(voidDrawSchema), voidDrawController);

/* ------------------------------------------------------------------ advances ------- */
router.get('/advances', requirePermission(PERMISSIONS.ADVANCE_VIEW), validate(advanceListSchema, 'query'), listAdvancesController);
router.post('/advances', requirePermission(PERMISSIONS.ADVANCE_CREATE), validate(createAdvanceSchema), createAdvanceController);
router.get('/advances/:id', requirePermission(PERMISSIONS.ADVANCE_VIEW), getAdvanceController);
router.patch('/advances/:id', requirePermission(PERMISSIONS.ADVANCE_UPDATE), validate(updateAdvanceSchema), updateAdvanceController);

/* ------------------------------------------------------------------- income -------- */
router.get('/income', requirePermission(PERMISSIONS.INCOME_VIEW), validate(incomeListSchema, 'query'), listIncomeController);
router.post('/income', requirePermission(PERMISSIONS.INCOME_CREATE), validate(createIncomeSchema), createIncomeController);

/* ----------------------------------------------------------------- expenses -------- */
router.get('/expenses', requirePermission(PERMISSIONS.EXPENSE_VIEW), validate(expenseListSchema, 'query'), listExpensesController);
router.post('/expenses', requirePermission(PERMISSIONS.EXPENSE_CREATE), validate(createExpenseSchema), createExpenseController);
router.post('/expenses/:id/reverse', requirePermission(PERMISSIONS.EXPENSE_REVERSE), validate(reverseExpenseSchema), reverseExpenseController);

/* ----------------------------------------------------------------- partners -------- */
router.get('/partners', requirePermission(PERMISSIONS.PARTNER_VIEW), listPartnersController);
router.get('/partners/:id/transactions', requirePermission(PERMISSIONS.PARTNER_VIEW), validate(partnerTxnListSchema, 'query'), partnerTransactionsController);
router.post('/partners/:id/transactions', requirePermission(PERMISSIONS.PARTNER_TXN_CREATE), validate(partnerTxnSchema), createPartnerTransactionController);

/* ------------------------------------------------------- accounts and cash --------- */
router.get('/financial-accounts', requirePermission(PERMISSIONS.ACCOUNT_VIEW), listAccountsController);
router.post('/financial-accounts', requirePermission(PERMISSIONS.ACCOUNT_CREATE), validate(createAccountSchema), createAccountController);
router.get('/cash-movements', requirePermission(PERMISSIONS.ACCOUNT_VIEW), validate(cashMovementListSchema, 'query'), listCashMovementsController);
router.get('/transfers', requirePermission(PERMISSIONS.ACCOUNT_VIEW), listTransfersController);
router.post('/transfers', requirePermission(PERMISSIONS.TRANSFER_CREATE), validate(transferSchema), createTransferController);
router.get('/reconciliation', requirePermission(PERMISSIONS.ACCOUNT_VIEW), listReconciliationsController);
router.post('/reconciliation', requirePermission(PERMISSIONS.RECONCILIATION_CREATE), validate(reconciliationSchema), createReconciliationController);

/* -------------------------------------------------------------- automatic lists ---- */
router.get('/lists/active-collections', requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(listQuerySchema, 'query'), activeCollectionListController);
router.get('/lists/drawn-closed', requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(listQuerySchema, 'query'), drawnClosedListController);
router.get('/lists/advance-bike', requirePermission(PERMISSIONS.ADVANCE_VIEW), validate(listQuerySchema, 'query'), advanceBikeListController);
router.get('/lists/advance-cash', requirePermission(PERMISSIONS.ADVANCE_VIEW), validate(listQuerySchema, 'query'), advanceCashListController);
router.get('/lists/overdue-partial', requirePermission(PERMISSIONS.INSTALLMENT_VIEW), validate(listQuerySchema, 'query'), overduePartialListController);
router.get('/lists/token-register', requirePermission(PERMISSIONS.TOKEN_VIEW), validate(tokenListSchema, 'query'), tokenRegisterListController);
router.get('/lists/mach', requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(listQuerySchema, 'query'), machListController);
router.get('/lists/quetta', requirePermission(PERMISSIONS.CUSTOMER_VIEW), validate(listQuerySchema, 'query'), quettaListController);
router.get('/lists/draw-eligible', requirePermission(PERMISSIONS.DRAW_VIEW), validate(eligibleSchema, 'query'), drawEligibleListController);

/* ------------------------------------------------------------------ reports -------- */
router.get('/reports', requirePermission(PERMISSIONS.REPORT_VIEW), reportCatalogController);
// NOTE: the preview route must stay above the customer-statement export route, otherwise
// GET /reports/customer-statement/preview is captured by :customerId === 'preview'.
router.get('/reports/:type/preview', requirePermission(PERMISSIONS.REPORT_VIEW), validate(reportQuerySchema, 'query'), reportPreviewController);
router.get('/reports/customer-statement/:customerId', requirePermission(PERMISSIONS.REPORT_VIEW), exportLimiter, validate(reportQuerySchema, 'query'), customerStatementReportController);
router.get('/reports/:type', requirePermission(PERMISSIONS.REPORT_EXPORT), exportLimiter, validate(reportQuerySchema, 'query'), reportController);

/* ----------------------------------------------------------------- settings -------- */
router.get('/settings', requirePermission(PERMISSIONS.SETTINGS_VIEW), getSettingsController);
router.get('/settings/meta', requirePermission(PERMISSIONS.SETTINGS_VIEW), settingsMetaController);
router.patch('/settings', requirePermission(PERMISSIONS.SETTINGS_UPDATE), validate(updateSettingsSchema), updateSettingsController);
/* ------------------------------------------------------------------ backups -------- */
router.get('/backups', requirePermission(PERMISSIONS.SETTINGS_VIEW), listBackupsController);
router.get('/backups/export', requirePermission(PERMISSIONS.SETTINGS_UPDATE), exportArchiveController);

export default router;
