import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, requestBlob } from '@/lib/api';
import type {
  CreateAdvanceResult,
  ReversalResult,
  RecordPaymentResult,
  CreateCustomerResult,
  AccountRow,
  AdvanceListResult,
  AdvanceRow,
  AuditLogRow,
  BackupRecordRow,
  CashMovementRow,
  ExpenseTotals,
  CashPositionRow,
  CollectionsPanel,
  CustomerRow,
  CustomerStatement,
  CustomerDetail,
  InstallmentListResult,
  DashboardSummary,
  DrawConfirmResult,
  DrawDetail,
  DrawRow,
  EligibleResult,
  ExpensesPanel,
  Installment,
  Paginated,
  PartnerRow,
  PaymentRow,
  IncomeTotals,
  PaymentTrail,
  ReceiptDoc,
  ReconciliationRow,
  ReportBundle,
  ReportMeta,
  SettingsDoc,
  SettingsMeta,
  PartnerTransactionsResult,
  TokenRegister,
  TransactionRow,
  TransferRow,
  UserRow,
} from '@/lib/types';

/** Drop undefined values so nothing is sent as the literal string "undefined". */
function clean<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export const keys = {
  dashboard: (filters: unknown) => ['dashboard', 'summary', filters] as const,
  dashboardCollections: (filters: unknown) => ['dashboard', 'collections', filters] as const,
  dashboardExpenses: (filters: unknown) => ['dashboard', 'expenses', filters] as const,
  customers: (filters: unknown) => ['customers', filters] as const,
  customer: (id: string) => ['customers', id] as const,
  statement: (id: string) => ['customers', id, 'statement'] as const,
  tokens: (filters: unknown) => ['tokens', filters] as const,
  installments: (filters: unknown) => ['installments', filters] as const,
  payments: (filters: unknown) => ['payments', filters] as const,
  paymentTrail: (id: string) => ['payments', id, 'trail'] as const,
  draws: (filters: unknown) => ['draws', filters] as const,
  draw: (id: string) => ['draws', id] as const,
  eligible: (filters: unknown) => ['draws', 'eligible', filters] as const,
  advances: (filters: unknown) => ['advances', filters] as const,
  income: (filters: unknown) => ['income', filters] as const,
  expenses: (filters: unknown) => ['expenses', filters] as const,
  partners: ['partners'] as const,
  partnerTransactions: (id: string, filters: unknown) => ['partners', id, 'transactions', filters] as const,
  accounts: ['accounts'] as const,
  movements: (filters: unknown) => ['cash-movements', filters] as const,
  transfers: ['transfers'] as const,
  reconciliations: ['reconciliations'] as const,
  list: (id: string, filters: unknown) => ['lists', id, filters] as const,
  reports: ['reports', 'catalog'] as const,
  reportPreview: (id: string, filters: unknown) => ['reports', id, filters] as const,
  settings: ['settings'] as const,
  settingsMeta: ['settings', 'meta'] as const,
  users: ['users'] as const,
  audit: (filters: unknown) => ['audit-logs', filters] as const,
  backups: ['backups'] as const,
};

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (...prefixes: ReadonlyArray<readonly unknown[]>) => {
    for (const prefix of prefixes) {
      void queryClient.invalidateQueries({ queryKey: [...prefix] });
    }
  };
}

/* ------------------------------------------------------------------ dashboard ---- */

export function useDashboardSummary(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.dashboard(filters),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: ({ signal }) => request<DashboardSummary>({ signal, url: '/api/dashboard/summary', params: clean(filters) }),
  });
}

export function useDashboardCollections(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.dashboardCollections(filters),
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      request<CollectionsPanel>({ signal, url: '/api/dashboard/collections', params: clean(filters) }),
  });
}

export function useDashboardExpenses(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.dashboardExpenses(filters),
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      request<ExpensesPanel>({ signal, url: '/api/dashboard/expenses', params: clean(filters) }),
  });
}

export function useDashboardCashPosition() {
  return useQuery({
    queryKey: ['dashboard', 'cash-position'],
    queryFn: ({ signal }) =>
      request<CashPositionRow[]>({ signal, url: '/api/dashboard/cash-position' }),
  });
}

/* ------------------------------------------------------------------ customers ---- */

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
  status?: string;
  drawStatus?: string;
  advanceType?: string;
  sortBy?: string;
  sortDir?: string;
}

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: keys.customers(filters),
    queryFn: ({ signal }) =>
      request<Paginated<CustomerRow>>({ signal, url: '/api/customers', params: clean(filters as Record<string, unknown>) }),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: keys.customer(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<CustomerDetail>({ signal, url: `/api/customers/${id}` }),
  });
}

export function useCustomerStatement(id: string | undefined) {
  return useQuery({
    queryKey: keys.statement(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<CustomerStatement>({ signal, url: `/api/customers/${id}/statement` }),
  });
}

export function useCreateCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<CreateCustomerResult>({ url: '/api/customers', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate(keys.customers({}), keys.tokens({}), [['dashboard'], ['lists']]),
  });
}

export function useUpdateCustomer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<CustomerRow>({ url: `/api/customers/${id}`, method: 'PATCH', data: clean(payload) }),
    onSuccess: () => invalidate(keys.customers({}), keys.customer(id), keys.statement(id), [['dashboard']]),
  });
}

/* -------------------------------------------------------------------- tokens ----- */

export function useTokens(filters: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: keys.tokens(filters),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: ({ signal }) =>
      request<TokenRegister>({ signal, url: '/api/tokens', params: clean(filters) }),
  });
}

export function useInitTokens() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => request<{ total: number }>({ url: '/api/tokens/init', method: 'POST' }),
    onSuccess: () => invalidate(keys.tokens({}), [['lists', 'token-register']]),
  });
}

/* --------------------------------------------------------------- installments ---- */

export function useInstallments(filters: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.installments(filters),
    queryFn: ({ signal }) => request<InstallmentListResult>({ signal, url: '/api/installments', params: clean(filters) }),
  });
}

export function useAdjustInstallment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: { installmentId: string; adjustedPkr: number; reason: string }) =>
      request<Installment>({ url: '/api/installments/adjust', method: 'POST', data: payload }),
    onSuccess: () => invalidate([['installments'], ['customers'], ['lists'], ['dashboard'], ['reports']]),
  });
}

/* ------------------------------------------------------------------- payments ---- */

export function usePayments(filters: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.payments(filters),
    queryFn: ({ signal }) =>
      request<Paginated<PaymentRow>>({signal, 
        url: '/api/payments',
        params: clean(filters),
      }),
  });
}

export function usePaymentTrail(id: string | null) {
  return useQuery({
    queryKey: keys.paymentTrail(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<PaymentTrail>({ signal, url: `/api/payments/${id}/trail` }),
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<RecordPaymentResult>({ url: '/api/payments', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['payments'], ['customers'], ['installments'], ['lists'], ['dashboard'], ['accounts'], ['cash-movements'], ['income'], ['reports']]),
  });
}

export function useReversePayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request<ReversalResult<PaymentRow>>({ url: `/api/payments/${id}/reverse`, method: 'POST', data: { reason } }),
    onSuccess: () => invalidate([['payments'], ['customers'], ['installments'], ['lists'], ['dashboard'], ['accounts'], ['cash-movements'], ['income'], ['reports']]),
  });
}

export function useAllocateCredit() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: { customerId: string; monthNumbers: number[]; amountPkr: number; reason?: string }) =>
      request<Record<string, unknown>>({ url: '/api/payments/allocate-credit', method: 'POST', data: payload }),
    onSuccess: () => invalidate([['payments'], ['customers'], ['installments'], ['lists']]),
  });
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: ['receipts', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<ReceiptDoc>({ signal, url: `/api/receipts/${id}` }),
  });
}

/* ---------------------------------------------------------------------- draws ---- */

export function useDraws(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.draws(filters),
    queryFn: ({ signal }) => request<DrawRow[]>({ signal, url: '/api/draws', params: clean(filters) }),
  });
}

export function useDraw(id: string | undefined) {
  return useQuery({
    queryKey: keys.draw(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<DrawDetail>({ signal, url: `/api/draws/${id}` }),
  });
}

export function useEligible(filters: { schemeMonth?: number; location?: string; schemeCode?: string }) {
  return useQuery({
    queryKey: keys.eligible(filters),
    enabled: Boolean(filters.schemeMonth),
    queryFn: ({ signal }) =>
      request<EligibleResult>({ signal, url: '/api/draws/eligible', params: clean(filters as Record<string, unknown>) }),
  });
}

export function useCreateDraw() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<DrawRow | DrawConfirmResult>({ url: '/api/draws', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['draws'], ['lists']]),
  });
}

export function useConfirmDraw() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      request<DrawConfirmResult>({ url: `/api/draws/${id}/confirm`, method: 'POST' }),
    onSuccess: () => invalidate([['draws'], ['customers'], ['installments'], ['lists'], ['dashboard'], ['reports']]),
  });
}

export function useCorrectDraw() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      request<DrawRow>({ url: `/api/draws/${id}/correct`, method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['draws'], ['customers'], ['installments'], ['lists'], ['dashboard'], ['reports']]),
  });
}

export function useVoidDraw() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request<DrawRow>({ url: `/api/draws/${id}/void`, method: 'POST', data: { reason } }),
    onSuccess: () => invalidate([['draws'], ['customers'], ['installments'], ['lists'], ['dashboard']]),
  });
}

/* -------------------------------------------------------------------- advances --- */

export function useAdvances(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.advances(filters),
    queryFn: ({ signal }) =>
      request<AdvanceListResult>({ signal, url: '/api/advances', params: clean(filters) }),
  });
}

export function useCreateAdvance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<CreateAdvanceResult>({ url: '/api/advances', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['advances'], ['customers'], ['lists'], ['dashboard'], ['accounts'], ['expenses'], ['cash-movements']]),
  });
}

export function useUpdateAdvance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<AdvanceRow>({ url: `/api/advances/${id}`, method: 'PATCH', data: clean(payload) }),
    onSuccess: () => invalidate([['advances'], ['customers'], ['lists'], ['dashboard']]),
  });
}

/* -------------------------------------------------------------------- finance ---- */

export function useIncome(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.income(filters),
    queryFn: ({ signal }) =>
      request<Paginated<TransactionRow> & { totals: IncomeTotals }>({signal, 
        url: '/api/income',
        params: clean(filters),
      }),
  });
}

export function useCreateIncome() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<TransactionRow>({ url: '/api/income', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['income'], ['accounts'], ['cash-movements'], ['dashboard'], ['reports']]),
  });
}

export function useExpenses(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.expenses(filters),
    queryFn: ({ signal }) =>
      request<Paginated<TransactionRow> & { totals: ExpenseTotals }>({signal, 
        url: '/api/expenses',
        params: clean(filters),
      }),
  });
}

export function useCreateExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<TransactionRow>({ url: '/api/expenses', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['expenses'], ['accounts'], ['cash-movements'], ['dashboard'], ['reports']]),
  });
}

export function useReverseExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request<ReversalResult<TransactionRow>>({ url: `/api/expenses/${id}/reverse`, method: 'POST', data: { reason } }),
    onSuccess: () => invalidate([['expenses'], ['accounts'], ['cash-movements'], ['dashboard'], ['reports']]),
  });
}

export function usePartners() {
  return useQuery({
    queryKey: keys.partners,
    staleTime: 60_000,
    queryFn: ({ signal }) => request<PartnerRow[]>({ signal, url: '/api/partners' }),
  });
}

export function usePartnerTransactions(id: string | undefined, filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.partnerTransactions(id ?? '', filters),
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      request<PartnerTransactionsResult>({ signal, url: `/api/partners/${id}/transactions`, params: clean(filters) }),
  });
}

export function useCreatePartnerTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      request<TransactionRow>({ url: `/api/partners/${id}/transactions`, method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate([['partners'], ['accounts'], ['cash-movements'], ['income'], ['expenses'], ['dashboard'], ['reports']]),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    staleTime: 60_000,
    queryFn: ({ signal }) => request<AccountRow[]>({ signal, url: '/api/financial-accounts' }),
  });
}

export function useCreateAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<AccountRow>({ url: '/api/financial-accounts', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate(keys.accounts, [['dashboard'], ['cash-movements']]),
  });
}

export function useCashMovements(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.movements(filters),
    queryFn: ({ signal }) =>
      request<Paginated<CashMovementRow>>({signal, 
        url: '/api/cash-movements',
        params: clean(filters),
      }),
  });
}

export function useTransfers() {
  return useQuery({
    queryKey: keys.transfers,
    staleTime: 30_000,
    queryFn: ({ signal }) => request<TransferRow[]>({ signal, url: '/api/transfers' }),
  });
}

export function useCreateTransfer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<TransferRow>({ url: '/api/transfers', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate(keys.transfers, keys.accounts, [['cash-movements'], ['dashboard'], ['reports']]),
  });
}

export function useReconciliations() {
  return useQuery({
    queryKey: keys.reconciliations,
    staleTime: 30_000,
    queryFn: ({ signal }) => request<ReconciliationRow[]>({ signal, url: '/api/reconciliation' }),
  });
}

export function useCreateReconciliation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<ReconciliationRow>({ url: '/api/reconciliation', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate(keys.reconciliations, keys.accounts, [['dashboard']]),
  });
}

/* --------------------------------------------------------------- automatic lists - */

export interface AutomaticListResult {
  items: Record<string, unknown>[];
  /** Present on the lists that can grow with the scheme (active collections, overdue/partial). */
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  totals: Record<string, number>;
}

export function useAutomaticList(id: string, filters: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: keys.list(id, filters),
    enabled,
    queryFn: ({ signal }) => request<AutomaticListResult>({ signal, url: `/api/lists/${id}`, params: clean(filters) }),
  });
}

/* --------------------------------------------------------------------- reports --- */

export function useReportCatalog() {
  return useQuery({
    queryKey: keys.reports,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => request<ReportMeta[]>({ signal, url: '/api/reports' }),
  });
}

export function useReportPreview(id: string, filters: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.reportPreview(id, filters),
    enabled: Boolean(id),
    queryFn: ({ signal }) => request<ReportBundle>({ signal, url: `/api/reports/${id}/preview`, params: clean(filters) }),
  });
}

export async function exportReport(id: string, filters: Record<string, unknown>, format: string) {
  return requestBlob({ url: `/api/reports/${id}`, params: clean({ ...filters, format }) });
}

export async function exportCustomerStatement(customerId: string, filters: Record<string, unknown>, format: string) {
  return requestBlob({ url: `/api/reports/customer-statement/${customerId}`, params: clean({ ...filters, format }) });
}

/* -------------------------------------------------------------------- settings --- */

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => request<SettingsDoc>({ signal, url: '/api/settings' }),
  });
}

export function useSettingsMeta() {
  return useQuery({
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryKey: keys.settingsMeta,
    queryFn: ({ signal }) =>
      request<SettingsMeta>({ signal, url: '/api/settings/meta' }),
  });
}

export function useUpdateSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<SettingsDoc>({ url: '/api/settings', method: 'PATCH', data: clean(payload) }),
    onSuccess: () => invalidate(keys.settings, [['dashboard'], ['customers'], ['installments']]),
  });
}

/* ----------------------------------------------------------------------- admin --- */

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => request<UserRow[]>({ signal, url: '/api/auth/users' }),
  });
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<UserRow>({ url: '/api/auth/users', method: 'POST', data: clean(payload) }),
    onSuccess: () => invalidate(keys.users),
  });
}

export function useUpdateUser(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request<UserRow>({ url: `/api/auth/users/${id}`, method: 'PATCH', data: clean(payload) }),
    onSuccess: () => invalidate(keys.users),
  });
}

export function useResetPassword() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, newPassword, reason }: { id: string; newPassword: string; reason?: string }) =>
      request<{ message: string }>({ url: `/api/auth/users/${id}/reset-password`, method: 'POST', data: { newPassword, reason } }),
    onSuccess: () => invalidate(keys.users),
  });
}

export function useAuditLogs(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: keys.audit(filters),
    queryFn: ({ signal }) => request<Paginated<AuditLogRow>>({ signal, url: '/api/auth/audit-logs', params: clean(filters) }),
  });
}

export function useBackups() {
  return useQuery({
    queryKey: keys.backups,
    queryFn: ({ signal }) => request<BackupRecordRow[]>({ signal, url: '/api/backups' }),
  });
}

export async function downloadBackupArchive() {
  return requestBlob({ url: '/api/backups/export', params: { format: 'json' } });
}


