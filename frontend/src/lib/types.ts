import type { PERMISSIONS } from './permissions';

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type Role = 'owner' | 'accountant' | 'customer_service' | 'draw_manager' | 'viewer';
export type Location = 'MACH' | 'QUETTA';
export type PaymentMethod = 'CASH' | 'BANK' | 'CHEQUE' | 'ONLINE' | 'OTHER';

/** Shape returned by POST /api/auth/login (the id field is `id`, not `_id`). */
export interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword?: boolean;
}

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
  permissions: Permission[];
  extraPermissions?: Permission[];
  deniedPermissions?: Permission[];
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: LoginUser;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

/** GET /api/installments - paged rows, with totals computed over the whole filtered set. */
export interface InstallmentListResult {
  items: Installment[];
  pagination: Pagination;
  totals: { count: number; scheduledPaisa: number; paidPaisa: number; outstandingPaisa: number };
}

export interface CustomerRow {
  _id: string;
  customerCode: string;
  name: string;
  fatherName?: string | null;
  cnic: string;
  cnicFormatted?: string | null;
  phone: string;
  location: Location;
  joiningDate: string;
  address?: string | null;
  notes?: string | null;
  status: 'active' | 'drawn_closed' | 'inactive';
  drawStatus: 'NONE' | 'PENDING' | 'CONFIRMED';
  advanceBikeActive?: boolean;
  advanceCashActive?: boolean;
  tokenNumber: number | null;
  enrollmentId: string | null;
  monthlyInstallmentPaisa: number;
  schemeTotalPaisa: number;
  totalPaidPaisa: number;
  outstandingPaisa: number;
  schemeStatus: string | null;
  createdAt: string;
}

export interface Installment extends Serialized {
  _id: string;
  enrollment?: string;
  customer?: Serialized;
  tokenNumber: number;
  tokenCode?: string;
  monthNumber: number;
  dueDate: string | null;
  scheduledPaisa: number;
  paidPaisa: number;
  adjustedPaisa: number;
  outstandingPaisa: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'not_applicable' | 'adjusted';
  stoppedAfterDraw?: boolean;
  notApplicableReason?: string | null;
  adjustmentReason?: string | null;
}

export interface PaymentRow extends Serialized {
  _id: string;
  paymentNumber?: string | null;
  customer?: { _id: string; name: string; cnic?: string; phone?: string; location?: Location } | null;
  enrollment?: string | null;
  tokenNumber?: number | null;
  tokenCode?: string | null;
  location?: Location | null;
  amountPaisa: number;
  amountPkr: number;
  amountFormatted: string;
  allocatedPaisa: number;
  unallocatedPaisa: number;
  allocations: Array<{ installment: string; monthNumber: number; amountPaisa: number }>;
  method: PaymentMethod;
  account?: string | null;
  accountName?: string | null;
  paymentDate: string;
  sourceType?: string | null;
  notes?: string | null;
  enteredBy?: string | null;
  enteredByName?: string | null;
  status: 'posted' | 'reversed';
  receipt?: string | null;
  reversesPayment?: string | null;
  cashMovement?: string | null;
  incomeTransaction?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentTrail {
  payment: Serialized;
  movements: Serialized[];
}

export interface ReceiptDoc extends Serialized {
  number: string;
  customer: Serialized;
  payment: Serialized;
  allocations: Serialized[];
}

export interface DrawRow extends Serialized {
  _id: string;
  schemeCode: string;
  schemeMonth: number;
  drawDate: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CORRECTED' | 'VOIDED';
  eligibleCount: number;
  eligibleSnapshot: Array<{
    tokenNumber: number;
    customerName: string;
    location: Location;
    installmentsPaid: number;
    outstandingPaisa: number;
    customer: string;
  }>;
  winnerTokenNumber?: number | null;
  winnerName?: string | null;
  winnerCustomer?: string | null;
  tokenCode?: string | null;
  reference?: string | null;
  operatorName?: string | null;
  approvedByName?: string | null;
  confirmedAt?: string | null;
  witnesses?: string[];
  notes?: string | null;
  closure?: string | null;
  corrections: Array<{ correctedAt: string; reason: string; originalValue: unknown; correctedValue: unknown }>;
}

export interface DrawDetail {
  draw: DrawRow;
  closure: Serialized | null;
  advances: Serialized[];
}

export interface DrawConfirmResult {
  draw: DrawRow;
  closure: Serialized;
  stoppedInstallments: number;
  totals: Record<string, number>;
}

export interface EligibleResult {
  schemeMonth: number;
  schemeCode: string;
  count: number;
  items: Array<{
    tokenNumber: number;
    customerName: string;
    location: Location;
    installmentsPaid: number;
    outstandingPaisa: number;
    customer: string;
    enrollment: string;
  }>;
}

export interface AdvanceRow extends Serialized {
  _id: string;
  advanceCode: string;
  customer: string;
  customerName: string;
  customerStatus: string;
  drawStatus: 'NONE' | 'PENDING' | 'CONFIRMED';
  enrollment: string;
  tokenNumber: number;
  tokenCode: string;
  location: Location;
  type: 'BIKE' | 'CASH';
  advanceDate: string;
  amountPaisa: number;
  bikeDescription?: string | null;
  bikeModel?: string | null;
  chassisNumber?: string | null;
  engineNumber?: string | null;
  method?: PaymentMethod | null;
  purpose?: string | null;
  authorizedBy?: string | null;
  approver?: string | null;
  supportingReference?: string | null;
  status: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
  stopsInstallments: boolean;
  installmentsContinue: boolean;
  notes?: string | null;
}

export interface AdvanceListResult {
  items: AdvanceRow[];
  pagination: Pagination;
  /** Always computed over the whole filtered set, never just the page on screen. */
  totals: {
    count: number;
    totalPaisa: number;
    bikeCount: number;
    cashCount: number;
    stillPayingCount: number;
  };
}

export interface TransactionRow extends Serialized {
  _id: string;
  transactionId: string;
  category: string;
  subCategory?: string | null;
  amountPaisa: number;
  transactionDate: string;
  method: PaymentMethod;
  account?: string | null;
  accountName?: string | null;
  status: 'posted' | 'reversed';
  isRevenue?: boolean;
  isOperatingExpense?: boolean;
  sourceType?: 'MANUAL' | 'CUSTOMER_PAYMENT' | 'PARTNER_CONTRIBUTION' | 'LOAN' | 'ADVANCE_CASH' | 'PARTNER_WITHDRAWAL' | 'REVERSAL';
  receiptNumber?: string | null;
  reference?: string | null;
  notes?: string | null;
  paidTo?: string | null;
  partner?: string | null;
  partnerName?: string | null;
  customer?: string | null;
  tokenNumber?: number | null;
  location?: Location | null;
  purpose?: string | null;
  reversalReason?: string | null;
  enteredByName?: string | null;
}

export interface IncomeTotals {
  totalPaisa: number;
  revenuePaisa: number;
}

export interface ExpenseTotals {
  totalPaisa: number;
  operatingPaisa: number;
  customerAdvancePaisa: number;
}

export interface PartnerRow extends Serialized {
  _id: string;
  partnerCode: string;
  name: string;
  phone?: string | null;
  isActive: boolean;
  openingBalancePaisa: number;
  totalContributedPaisa: number;
  totalWithdrawnPaisa: number;
  totalRepaidPaisa: number;
  netCashPaisa: number;
}

export interface PartnerTransactionRow extends Serialized {
  _id: string;
  transactionId: string;
  partnerName: string;
  type: 'WITHDRAWAL' | 'CONTRIBUTION' | 'REPAYMENT' | 'CORRECTION';
  amountPaisa: number;
  cashEffectPaisa: number;
  method: PaymentMethod;
  accountName?: string | null;
  transactionDate: string;
  purpose?: string | null;
  reference?: string | null;
  status: 'posted' | 'reversed';
  enteredByName?: string | null;
}

export interface AccountRow extends Serialized {
  _id: string;
  name: string;
  type: 'CASH' | 'BANK';
  bankName?: string | null;
  accountNumber?: string | null;
  openingBalancePaisa: number;
  balancePaisa: number;
  isDefault?: boolean;
  location?: 'MACH' | 'QUETTA' | 'ALL' | null;
  isActive: boolean;
}

export interface CashMovementRow extends Serialized {
  _id: string;
  account: string;
  accountName: string;
  accountType: 'CASH' | 'BANK';
  direction: 'IN' | 'OUT';
  amountPaisa: number;
  movementDate: string;
  sourceType: string;
  sourceRef?: string | null;
  description?: string | null;
  status: 'posted' | 'reversed';
  location?: Location | null;
}

export interface ReconciliationRow extends Serialized {
  _id: string;
  account: string;
  accountName: string;
  accountType: 'CASH' | 'BANK';
  closingDate: string;
  openingBalancePaisa: number;
  totalInPaisa: number;
  totalOutPaisa: number;
  systemCalculatedPaisa: number;
  actualCountedPaisa: number;
  differencePaisa: number;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
  notes?: string | null;
  createdAt: string;
}

export interface TransferRow extends Serialized {
  _id: string;
  transferId: string;
  fromAccount: string;
  fromAccountName: string;
  toAccount: string;
  toAccountName: string;
  amountPaisa: number;
  transferDate: string;
  method?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
  status: 'posted' | 'reversed';
}

export interface TokenAssignment {
  enrollmentId: string;
  customerId: string;
  customerName: string;
  location: Location;
  status: string;
  startDate: string;
}

export interface TokenRow {
  _id: string;
  number: number;
  code: string;
  status: 'assigned' | 'unassigned';
  assignmentHistoryCount?: number;
  currentAssignment?: TokenAssignment | null;
}

export interface TokenRegister {
  total: number;
  assigned: number;
  unassigned: number;
  items: TokenRow[];
}

export interface SettingsDoc extends Serialized {
  _id: string;
  businessName: string;
  reportHeader: string;
  currentSchemeMonth: number;
  defaultSchemeDurationMonths: number;
  allowPartialPayments: boolean;
  allowMultipleMonthPayments: boolean;
  duplicateCnicPolicy: 'block' | 'warn' | 'allow';
  autoCloseOnDraw: boolean;
  receiptPrefix: string;
  receiptSeqPadding: number;
  installmentDueDayOfMonth: number | null;
  cnicMaskingEnabled: boolean;
  timezone: string;
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethods: PaymentMethod[];
  locations: Location[];
}

export interface SettingsMeta {
  settings: SettingsDoc;
  tokenSlots: number;
  installmentMonths: number;
  locations: Location[];
  currency: string;
}

export interface AuditLogRow extends Serialized {
  _id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  description?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface BackupRecordRow extends Serialized {
  _id: string;
  kind: 'EXPORT' | 'RESTORE' | 'SCHEDULED' | 'MIGRATION';
  label: string;
  format: 'json' | 'xlsx' | 'csv' | 'mongodump';
  location: string;
  sizeBytes: number;
  collectionCounts: Record<string, number>;
  status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  createdAt: string;
}

export interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  permissions: Permission[];
  extraPermissions?: Permission[];
  deniedPermissions?: Permission[];
}

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  type: 'text' | 'number' | 'money' | 'date';
}

export interface ReportSheet {
  id: string;
  name: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Array<{ label: string; value: string; money?: boolean }>;
}

export interface ReportBundle {
  reportId: string;
  title: string;
  period?: string | null;
  generatedAt: string;
  generatedBy?: string | null;
  filters?: Record<string, unknown>;
  sheets: ReportSheet[];
}

export interface ReportMeta {
  id: string;
  name: string;
  description?: string;
}

/** Money block returned by the dashboard: always paisa + pkr + a formatted string. */
export interface MoneyAmount {
  paisa: number;
  pkr: number;
  formatted: string;
}

export interface DashboardSummary {
  generatedAt: string;
  range: { from: string; to: string };
  tokens: { total: number; registered: number; assigned: number; unassigned: number };
  scheme: { currentSchemeMonth: number; durationMonths: number };
  customers: { active: number; drawnClosed: number };
  advances: { bikeCases: number; cashCases: number };
  draws: { confirmed: number };
  collections: { today: MoneyAmount; thisMonth: MoneyAmount; range: MoneyAmount };
  operatingExpenses: { today: MoneyAmount; thisMonth: MoneyAmount; range: MoneyAmount };
  customerAdvances: { today: MoneyAmount; thisMonth: MoneyAmount };
  partnerWithdrawals: { today: MoneyAmount; thisMonth: MoneyAmount };
  partnerContributions: { thisMonth: MoneyAmount };
  cashFlow: { totalInflow: MoneyAmount; totalOutflow: MoneyAmount; net: MoneyAmount };
  balances: {
    cash: MoneyAmount;
    bank: MoneyAmount;
    combined: MoneyAmount;
    accounts: Array<{
      id: string;
      name: string;
      type: 'CASH' | 'BANK';
      balancePaisa: number;
      openingBalancePaisa: number;
    }>;
  };
  installments: { overdue: number; partial: number };
  recentTransactions: Array<{
    kind: string;
    id: string;
    date: string;
    label: string;
    direction: 'IN' | 'OUT';
    amountPaisa: number;
    accountName: string | null;
  }>;
  alerts: Array<{ level: 'info' | 'warning' | 'error'; message: string; count?: number }>;
}

export interface CollectionsPanel {
  monthly: Array<{ label: string; totalPaisa: number; count: number }>;
  daily: Array<{ label: string; collectionsPaisa: number; expensesPaisa: number }>;
  byLocation: Array<{ location: 'MACH' | 'QUETTA'; totalPaisa: number; count: number }>;
  byInstallmentMonth: Array<{ monthNumber: number; totalPaisa: number; count: number }>;
}

export interface ExpensesPanel {
  daily: Array<{ label: string; collectionsPaisa: number; expensesPaisa: number }>;
  byCategory: Array<{ category: string; totalPaisa: number; operatingPaisa: number; count: number }>;
}

export interface CashPositionRow {
  accountId: string;
  name: string;
  type: 'CASH' | 'BANK';
  openingBalancePaisa: number;
  inflowPaisa: number;
  outflowPaisa: number;
  closingBalancePaisa: number;
  calculatedClosingPaisa: number;
}

/* ------------------------------------------------- restored shared structures ---- */

/** `serializeMoney` adds `*Pkr` and `*Formatted` siblings for every `*Paisa` field. */
export interface Serialized {
  [key: string]: unknown;
}

export interface CustomerDetail {
  customer: Serialized;
  enrollments: Serialized[];
  activeEnrollment: Serialized | null;
  installmentStatusCounts: Record<string, number>;
}

export interface CustomerStatement {
  customer: Serialized;
  enrollments: Serialized[];
  installments: Installment[];
  payments: Serialized[];
  draws: Serialized[];
  advances: Serialized[];
  closures: Serialized[];
  auditTrail: Serialized[];
}

export interface PartnerTransactionsResult {
  partner: PartnerRow;
  items: PartnerTransactionRow[];
  totals: { withdrawn: number; contributed: number; repaid: number; net: number };
}

/* ----------------------------------------- mutation result envelopes (verified live) ---- */

/** POST /api/customers returns the customer plus its freshly generated schedule. */
export interface CreateCustomerResult {
  customer: CustomerRow;
  enrollmentId: string;
  installmentCount: number;
  schemeTotalPaisa: number;
  schemeTotalPkr: number;
  schemeTotalFormatted: string;
}

/** POST /api/payments returns the payment, its receipt and the allocation detail. */
export interface RecordPaymentResult {
  payment: PaymentRow;
  receipt: ReceiptDoc;
  credit: boolean;
  allocations: Array<{ installmentId: string; monthNumber: number; amountPaisa: number }>;
  rejected: Array<{ monthNumber: number; reason: string }>;
  unallocatedPaisa: number;
}

/** Reversals keep the original document and add a negative mirror. */
export interface ReversalResult<T> {
  original: T;
  reversal: T;
}

/** POST /api/advances - installments keep running after an advance. */
export interface CreateAdvanceResult {
  advance: AdvanceRow;
  payableInstallmentsRemaining: number;
}
