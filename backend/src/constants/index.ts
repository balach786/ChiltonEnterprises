/**
 * Centralised business constants for the Motorcycle Showroom Management System.
 * These values are taken directly from the PRD (pages 3, 4, 5, 17).
 */

export const SCHEME = {
  /** Exactly 120 token slots, Token 001 - Token 120 (PRD p.3, p.4) */
  TOTAL_TOKEN_SLOTS: 120,
  /** Each enrolment has exactly 28 monthly installment periods (PRD p.3, p.7) */
  INSTALLMENT_MONTHS: 28,
  /** Currency of every monetary value */
  CURRENCY: 'PKR',
  /** The only two allowed customer locations */
  LOCATIONS: ['MACH', 'QUETTA'] as const,
} as const;

export type Location = (typeof SCHEME.LOCATIONS)[number];

export const PARTNER_SEED = [
  { code: 'P01', name: 'Irfan' },
  { code: 'P02', name: 'Ghulam Muhammad' },
  { code: 'P03', name: 'Hafiz Khalid' },
] as const;

export const ROLES = {
  OWNER: 'owner',
  ACCOUNTANT: 'accountant',
  CUSTOMER_SERVICE: 'customer_service',
  DRAW_MANAGER: 'draw_manager',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = [
  ROLES.OWNER,
  ROLES.ACCOUNTANT,
  ROLES.CUSTOMER_SERVICE,
  ROLES.DRAW_MANAGER,
  ROLES.VIEWER,
];

export const CUSTOMER_STATUS = {
  ACTIVE: 'active',
  DRAWN_CLOSED: 'drawn_closed',
  INACTIVE: 'inactive',
} as const;

export const INSTALLMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  NOT_APPLICABLE: 'not_applicable',
  ADJUSTED: 'adjusted',
} as const;

export const PAYMENT_METHODS = ['CASH', 'BANK', 'CHEQUE', 'ONLINE', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ADVANCE_TYPES = ['BIKE', 'CASH'] as const;
export type AdvanceType = (typeof ADVANCE_TYPES)[number];

export const ADVANCE_STATUS = ['ACTIVE', 'SETTLED', 'CANCELLED'] as const;

export const DRAW_STATUS = ['DRAFT', 'CONFIRMED', 'CORRECTED', 'VOIDED'] as const;

export const PARTNER_TXN_TYPES = [
  'WITHDRAWAL',
  'CONTRIBUTION',
  'REPAYMENT',
  'CORRECTION',
] as const;
export type PartnerTxnType = (typeof PARTNER_TXN_TYPES)[number];

export const MOVEMENT_DIRECTION = ['IN', 'OUT'] as const;

/**
 * Cash-movement source types. A single source transaction must never create more
 * than one cash movement (PRD p.11 / p.13 "No duplicate entry").
 */
export const MOVEMENT_SOURCES = [
  'CUSTOMER_PAYMENT',
  'INCOME',
  'EXPENSE',
  'PARTNER_TXN',
  'ADVANCE_CASH',
  'TRANSFER',
  'OPENING_BALANCE',
] as const;
export type MovementSource = (typeof MOVEMENT_SOURCES)[number];

export const EXPENSE_CATEGORIES = [
  'UTILITY_BILLS',
  'CUSTOMER_ADVANCE_CASH',
  'DAILY_FOOD',
  'MAINTENANCE',
  'TRAVELING',
  'PARTNER_WITHDRAWAL',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Operating-expense categories. Partner withdrawals and customer cash advances are
 * cash outflows but must NOT be counted inside operating expenses (PRD p.12).
 */
export const OPERATING_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'UTILITY_BILLS',
  'DAILY_FOOD',
  'MAINTENANCE',
  'TRAVELING',
  'OTHER',
];

export const INCOME_CATEGORIES = [
  'CUSTOMER_INSTALLMENT',
  'CUSTOMER_OTHER',
  'BUSINESS_REVENUE',
  'PARTNER_CONTRIBUTION',
  'LOAN_OR_FUNDING',
  'OTHER',
] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Income categories that count towards "Total revenue/income".
 * Partner contributions and loans are funding, never revenue (PRD p.10 / p.13).
 */
export const REVENUE_INCOME_CATEGORIES: IncomeCategory[] = [
  'CUSTOMER_INSTALLMENT',
  'CUSTOMER_OTHER',
  'BUSINESS_REVENUE',
  'OTHER',
];

export const ACCOUNT_TYPES = ['CASH', 'BANK'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
