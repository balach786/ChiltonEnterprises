import { ALL_ROLES, ROLES, Role } from '../constants';

/**
 * Fine grained permission strings. Every protected route declares the permission it
 * needs and the matrix below is the single source of truth (PRD p.5 role table).
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',

  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_CLOSE: 'customer:close',

  TOKEN_VIEW: 'token:view',

  INSTALLMENT_VIEW: 'installment:view',

  PAYMENT_VIEW: 'payment:view',
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_REVERSE: 'payment:reverse',

  RECEIPT_VIEW: 'receipt:view',

  DRAW_VIEW: 'draw:view',
  DRAW_CREATE: 'draw:create',
  DRAW_CONFIRM: 'draw:confirm',
  DRAW_CORRECT: 'draw:correct',

  ADVANCE_VIEW: 'advance:view',
  ADVANCE_CREATE: 'advance:create',
  ADVANCE_UPDATE: 'advance:update',

  INCOME_VIEW: 'income:view',
  INCOME_CREATE: 'income:create',

  EXPENSE_VIEW: 'expense:view',
  EXPENSE_CREATE: 'expense:create',
  EXPENSE_REVERSE: 'expense:reverse',

  PARTNER_VIEW: 'partner:view',
  PARTNER_TXN_CREATE: 'partner:txn:create',

  ACCOUNT_VIEW: 'account:view',
  ACCOUNT_CREATE: 'account:create',
  ACCOUNT_UPDATE: 'account:update',
  TRANSFER_CREATE: 'transfer:create',
  RECONCILIATION_CREATE: 'reconciliation:create',

  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',

  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',

  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',

  AUDIT_VIEW: 'audit:view',

  CNIC_VIEW: 'cnic:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL: Permission[] = Object.values(PERMISSIONS);

const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.TOKEN_VIEW,
  PERMISSIONS.INSTALLMENT_VIEW,
  PERMISSIONS.PAYMENT_VIEW,
  PERMISSIONS.RECEIPT_VIEW,
  PERMISSIONS.DRAW_VIEW,
  PERMISSIONS.ADVANCE_VIEW,
  PERMISSIONS.INCOME_VIEW,
  PERMISSIONS.EXPENSE_VIEW,
  PERMISSIONS.PARTNER_VIEW,
  PERMISSIONS.ACCOUNT_VIEW,
  PERMISSIONS.REPORT_VIEW,
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Owner / Administrator - full authorised system access (PRD p.5).
  [ROLES.OWNER]: ALL,

  // Accountant - payments, income, expenses, partner transactions, cash/bank, reports.
  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.TOKEN_VIEW,
    PERMISSIONS.INSTALLMENT_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_REVERSE,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.DRAW_VIEW,
    PERMISSIONS.ADVANCE_VIEW,
    PERMISSIONS.ADVANCE_UPDATE,
    PERMISSIONS.INCOME_VIEW,
    PERMISSIONS.INCOME_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.EXPENSE_REVERSE,
    PERMISSIONS.PARTNER_VIEW,
    PERMISSIONS.PARTNER_TXN_CREATE,
    PERMISSIONS.ACCOUNT_VIEW,
    PERMISSIONS.TRANSFER_CREATE,
    PERMISSIONS.RECONCILIATION_CREATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  ],

  // Customer-service staff - customer fields, payments, receipts, statements.
  [ROLES.CUSTOMER_SERVICE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.TOKEN_VIEW,
    PERMISSIONS.INSTALLMENT_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.DRAW_VIEW,
    PERMISSIONS.ADVANCE_VIEW,
    PERMISSIONS.INCOME_VIEW,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.PARTNER_VIEW,
    PERMISSIONS.ACCOUNT_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],

  // Draw manager - eligible lists, draw events, history; confirm only if granted.
  [ROLES.DRAW_MANAGER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.TOKEN_VIEW,
    PERMISSIONS.INSTALLMENT_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.DRAW_VIEW,
    PERMISSIONS.DRAW_CREATE,
    PERMISSIONS.ADVANCE_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],

  // Read-only viewer - view only, never create/edit/delete/approve/reverse.
  [ROLES.VIEWER]: VIEWER_PERMISSIONS,
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function rolePermissionMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const role of ALL_ROLES) out[role] = permissionsForRole(role);
  return out;
}
