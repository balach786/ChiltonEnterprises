import { z } from 'zod';
import { ALL_ROLES, PAYMENT_METHODS, SCHEME } from '../constants';

/* --------------------------------------------------------------- shared pieces ----- */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const location = z.enum(['MACH', 'QUETTA']);
const method = z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]);
const pkr = z.coerce.number().positive('Amount must be greater than zero');
const isoDate = z.coerce.date();

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
});

const dateRange = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/* --------------------------------------------------------------------- auth -------- */

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ALL_ROLES as unknown as [string, ...string[]]),
  extraPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.enum(ALL_ROLES as unknown as [string, ...string[]]).optional(),
  isActive: z.boolean().optional(),
  extraPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
  mustChangePassword: z.boolean().optional(),
  reason: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
  reason: z.string().optional(),
});

/* ------------------------------------------------------------------ customers ------ */

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  cnic: z
    .string()
    .min(13, 'CNIC must be 13 digits')
    .transform((v) => v.replace(/\D+/g, ''))
    .refine((v) => /^\d{13}$/.test(v), 'CNIC must contain exactly 13 digits'),
  phone: z.string().min(10, 'Phone number is required').max(20),
  location,
  joiningDate: isoDate,
  monthlyInstallmentPkr: pkr,
  tokenNumber: z.coerce.number().int().min(1).max(SCHEME.TOTAL_TOKEN_SLOTS),
  schemeCode: z.string().max(10).optional(),
  fatherName: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  feesPkr: z.coerce.number().min(0).optional(),
  durationMonths: z.coerce.number().int().optional(),
  acknowledgeDuplicateCnic: z.boolean().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(10).max(20).optional(),
  location: location.optional(),
  fatherName: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'drawn_closed', 'inactive']).optional(),
  reason: z.string().optional(),
});

export const customerListSchema = pagination.extend({
  search: z.string().max(120).optional(),
  location: location.optional(),
  status: z.enum(['active', 'drawn_closed', 'inactive']).optional(),
  drawStatus: z.enum(['NONE', 'PENDING', 'CONFIRMED']).optional(),
  advanceType: z.enum(['BIKE', 'CASH']).optional(),
  sortBy: z.enum(['name', 'joiningDate', 'location', 'status', 'createdAt', 'customerCode']).optional(),
  sortDir: z.enum(['1', '-1']).transform((v) => Number(v) as 1 | -1).optional(),
});

export const tokenListSchema = z.object({
  status: z.enum(['assigned', 'unassigned']).optional(),
  search: z.string().max(60).optional(),
});

/* --------------------------------------------------------- installments / payments - */

export const recordPaymentSchema = z.object({
  customerId: objectId,
  enrollmentId: objectId.optional(),
  monthNumbers: z.array(z.coerce.number().int().min(1).max(120)).optional(),
  installmentIds: z.array(objectId).optional(),
  autoAllocate: z.boolean().optional(),
  amountPkr: pkr,
  paymentDate: isoDate.optional(),
  method: method.optional(),
  accountId: objectId.optional(),
  notes: z.string().max(1000).optional(),
  sourceType: z.enum(['INSTALLMENT', 'OTHER']).optional(),
  allowCredit: z.boolean().optional(),
  idempotencyKey: z.string().max(80).optional(),
});

export const reversePaymentSchema = z.object({
  reason: z.string().min(5, 'A reason of at least 5 characters is required').max(500),
});

export const allocateCreditSchema = z.object({
  customerId: objectId,
  monthNumbers: z.array(z.coerce.number().int().min(1).max(120)).min(1),
  amountPkr: pkr,
  reason: z.string().max(500).optional(),
});

export const paymentListSchema = pagination.extend({
  customerId: objectId.optional(),
  enrollmentId: objectId.optional(),
  tokenNumber: z.coerce.number().int().optional(),
  location: location.optional(),
  method: method.optional(),
  status: z.enum(['posted', 'reversed']).optional(),
  includeReversals: z.coerce.boolean().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const installmentListSchema = z.object({
  /** Optional server-side pagination. Without it the list defaults to 25 rows (28 when a
   *  single enrollment/customer is requested, i.e. one complete schedule). */
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  enrollmentId: objectId.optional(),
  customerId: objectId.optional(),
  tokenNumber: z.coerce.number().int().optional(),
  status: z.enum(['unpaid', 'partial', 'paid', 'overdue', 'not_applicable', 'adjusted']).optional(),
  monthNumber: z.coerce.number().int().min(1).max(120).optional(),
  includeStopped: z.coerce.boolean().optional(),
  dueBefore: isoDate.optional(),
  dueAfter: isoDate.optional(),
});

export const adjustInstallmentSchema = z.object({
  installmentId: objectId,
  adjustedPkr: z.coerce.number().min(0),
  reason: z.string().min(5).max(500),
});

/* -------------------------------------------------------------------- draws -------- */

export const createDrawSchema = z.object({
  schemeMonth: z.coerce.number().int().min(1).max(SCHEME.INSTALLMENT_MONTHS),
  drawDate: isoDate,
  schemeCode: z.string().max(10).optional(),
  winnerTokenNumber: z.coerce.number().int().min(1).max(SCHEME.TOTAL_TOKEN_SLOTS).optional(),
  reference: z.string().max(120).optional(),
  witnesses: z.array(z.string().max(120)).optional(),
  notes: z.string().max(2000).optional(),
  location: location.optional(),
  confirm: z.boolean().optional(),
});

export const correctDrawSchema = z.object({
  newWinnerTokenNumber: z.coerce.number().int().min(1).max(SCHEME.TOTAL_TOKEN_SLOTS).optional(),
  drawDate: isoDate.optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().min(5, 'A reason is required').max(500),
});

export const voidDrawSchema = z.object({ reason: z.string().min(5).max(500) });

export const eligibleSchema = z.object({
  schemeMonth: z.coerce.number().int().min(1).max(SCHEME.INSTALLMENT_MONTHS),
  schemeCode: z.string().max(10).optional(),
  location: location.optional(),
});

export const drawListSchema = z.object({
  schemeMonth: z.coerce.number().int().min(1).max(120).optional(),
  location: location.optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'CORRECTED', 'VOIDED']).optional(),
  tokenNumber: z.coerce.number().int().optional(),
  customerId: objectId.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/* ------------------------------------------------------------------ advances ------- */

export const createAdvanceSchema = z.object({
  customerId: objectId,
  enrollmentId: objectId.optional(),
  type: z.enum(['BIKE', 'CASH']),
  advanceDate: isoDate,
  amountPkr: z.coerce.number().min(0),
  bikeDescription: z.string().max(500).optional(),
  bikeModel: z.string().max(120).optional(),
  chassisNumber: z.string().max(60).optional(),
  engineNumber: z.string().max(60).optional(),
  method: method.optional(),
  accountId: objectId.optional(),
  purpose: z.string().max(500).optional(),
  authorizedBy: z.string().max(120).optional(),
  approver: z.string().max(120).optional(),
  supportingReference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['ACTIVE', 'SETTLED', 'CANCELLED']).optional(),
});

export const updateAdvanceSchema = z.object({
  status: z.enum(['ACTIVE', 'SETTLED', 'CANCELLED']).optional(),
  approver: z.string().max(120).optional(),
  supportingReference: z.string().max(120).optional(),
  settlementNotes: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  purpose: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
});

export const advanceListSchema = z.object({
  type: z.enum(['BIKE', 'CASH']).optional(),
  status: z.enum(['ACTIVE', 'SETTLED', 'CANCELLED']).optional(),
  location: location.optional(),
  customerId: objectId.optional(),
  tokenNumber: z.coerce.number().int().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  onlyStillPaying: z.coerce.boolean().optional(),
  onlyDrawnLater: z.coerce.boolean().optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/* ------------------------------------------------------------------ finance -------- */

export const createIncomeSchema = z.object({
  category: z.string().min(2).max(60),
  amountPkr: pkr,
  transactionDate: isoDate.optional(),
  method: method.optional(),
  accountId: objectId.optional(),
  customerId: objectId.optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const createExpenseSchema = z.object({
  category: z.string().min(2).max(60),
  subCategory: z.string().max(120).optional(),
  amountPkr: pkr,
  transactionDate: isoDate.optional(),
  method: method.optional(),
  accountId: objectId.optional(),
  paidTo: z.string().max(160).optional(),
  partnerId: objectId.optional(),
  customerId: objectId.optional(),
  location: location.optional(),
  purpose: z.string().max(1000).optional(),
});

export const reverseExpenseSchema = z.object({ reason: z.string().min(5).max(500) });

export const partnerTxnSchema = z.object({
  type: z.enum(['WITHDRAWAL', 'CONTRIBUTION', 'REPAYMENT', 'CORRECTION']),
  amountPkr: pkr,
  transactionDate: isoDate.optional(),
  method: method.optional(),
  accountId: objectId.optional(),
  purpose: z.string().max(1000).optional(),
  reference: z.string().max(120).optional(),
});

export const createAccountSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['CASH', 'BANK']),
  bankName: z.string().max(160).optional(),
  accountNumber: z.string().max(60).optional(),
  openingBalancePkr: z.coerce.number().optional(),
  isDefault: z.boolean().optional(),
  location: z.enum(['MACH', 'QUETTA', 'ALL']).optional(),
  notes: z.string().max(1000).optional(),
});

export const transferSchema = z.object({
  fromAccountId: objectId,
  toAccountId: objectId,
  amountPkr: pkr,
  transferDate: isoDate.optional(),
  method: method.optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const reconciliationSchema = z.object({
  accountId: objectId,
  closingDate: isoDate,
  actualCountedPkr: z.coerce.number().min(0),
  notes: z.string().max(2000).optional(),
  status: z.enum(['OPEN', 'APPROVED']).optional(),
});

export const cashMovementListSchema = pagination.extend({
  accountId: objectId.optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  sourceType: z
    .enum(['CUSTOMER_PAYMENT', 'INCOME', 'EXPENSE', 'PARTNER_TXN', 'ADVANCE_CASH', 'TRANSFER', 'OPENING_BALANCE'])
    .optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const incomeListSchema = pagination.extend({
  category: z.string().optional(),
  location: location.optional(),
  method: method.optional(),
  revenueOnly: z.coerce.boolean().optional(),
  customerId: objectId.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const expenseListSchema = pagination.extend({
  category: z.string().optional(),
  subCategory: z.string().optional(),
  location: location.optional(),
  method: method.optional(),
  partnerId: objectId.optional(),
  customerId: objectId.optional(),
  operatingOnly: z.coerce.boolean().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const partnerTxnListSchema = dateRange;

/* ------------------------------------------------------------------ settings ------- */

export const updateSettingsSchema = z.object({
  businessName: z.string().max(120).optional(),
  reportHeader: z.string().max(200).optional(),
  currentSchemeMonth: z.coerce.number().int().min(1).max(SCHEME.INSTALLMENT_MONTHS).optional(),
  allowPartialPayments: z.boolean().optional(),
  allowMultipleMonthPayments: z.boolean().optional(),
  duplicateCnicPolicy: z.enum(['block', 'warn', 'allow']).optional(),
  autoCloseOnDraw: z.boolean().optional(),
  receiptPrefix: z.string().max(12).optional(),
  receiptSeqPadding: z.coerce.number().int().min(3).max(10).optional(),
  installmentDueDayOfMonth: z.coerce.number().int().min(1).max(28).nullable().optional(),
  cnicMaskingEnabled: z.boolean().optional(),
  timezone: z.string().max(60).optional(),
  reason: z.string().max(500).optional(),
});

/* ------------------------------------------------------------------- reports ------- */

export const reportQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf', 'csv', 'json']).default('xlsx'),
  customerId: objectId.optional(),
  partnerId: objectId.optional(),
  location: location.optional(),
  status: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
  method: method.optional(),
  schemeMonth: z.coerce.number().int().min(1).max(120).optional(),
  tokenNumber: z.coerce.number().int().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const dashboardQuerySchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  location: location.optional(),
  months: z.coerce.number().int().min(1).max(36).optional(),
});

export const listQuerySchema = z.object({
  location: location.optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const auditQuerySchema = pagination.extend({
  entityType: z.string().max(60).optional(),
  action: z.string().max(40).optional(),
  actorId: objectId.optional(),
  entityId: z.string().max(60).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});
