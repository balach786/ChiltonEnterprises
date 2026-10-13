import { hasPermission, permissionsForRole, rolePermissionMap } from '../../constants/permissions';
import { PERMISSIONS } from '../../constants/permissions';
import { ALL_ROLES, ROLES } from '../../constants';
import { partnerCashEffect } from '../../models/PartnerTransaction';
import { closingBalance } from '../../services/finance.service';
import { effectivePermissions } from '../../middleware/auth';
import { isValidCnic, isValidPhone } from '../../services/customer.service';
import { maskCnic, normalizeCnic, formatCnic } from '../../models/Customer';

describe('role based permissions (PRD p.5)', () => {
  it('gives the owner every permission', () => {
    const all = Object.values(PERMISSIONS);
    const owner = permissionsForRole(ROLES.OWNER);
    for (const p of all) expect(owner).toContain(p);
  });

  it('lets the accountant record and reverse payments, expenses and partner transactions', () => {
    const acc = permissionsForRole(ROLES.ACCOUNTANT);
    expect(acc).toContain(PERMISSIONS.PAYMENT_CREATE);
    expect(acc).toContain(PERMISSIONS.PAYMENT_REVERSE);
    expect(acc).toContain(PERMISSIONS.EXPENSE_CREATE);
    expect(acc).toContain(PERMISSIONS.PARTNER_TXN_CREATE);
    expect(acc).toContain(PERMISSIONS.TRANSFER_CREATE);
    expect(acc).toContain(PERMISSIONS.RECONCILIATION_CREATE);
    expect(acc).toContain(PERMISSIONS.REPORT_EXPORT);
  });

  it('does not let the accountant manage users or settings', () => {
    const acc = permissionsForRole(ROLES.ACCOUNTANT);
    expect(acc).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(acc).not.toContain(PERMISSIONS.SETTINGS_UPDATE);
    expect(acc).not.toContain(PERMISSIONS.AUDIT_VIEW);
  });

  it('lets customer-service staff create customers and record payments but not reverse them', () => {
    const cs = permissionsForRole(ROLES.CUSTOMER_SERVICE);
    expect(cs).toContain(PERMISSIONS.CUSTOMER_CREATE);
    expect(cs).toContain(PERMISSIONS.CUSTOMER_UPDATE);
    expect(cs).toContain(PERMISSIONS.PAYMENT_CREATE);
    expect(cs).toContain(PERMISSIONS.RECEIPT_VIEW);
    expect(cs).not.toContain(PERMISSIONS.PAYMENT_REVERSE);
    expect(cs).not.toContain(PERMISSIONS.DRAW_CONFIRM);
    expect(cs).not.toContain(PERMISSIONS.EXPENSE_CREATE);
  });

  it('lets the draw manager record draws but NOT confirm them by default', () => {
    const dm = permissionsForRole(ROLES.DRAW_MANAGER);
    expect(dm).toContain(PERMISSIONS.DRAW_CREATE);
    expect(dm).toContain(PERMISSIONS.DRAW_VIEW);
    expect(dm).not.toContain(PERMISSIONS.DRAW_CONFIRM);
    expect(dm).not.toContain(PERMISSIONS.PAYMENT_CREATE);
  });

  it('grants the draw manager confirmation only when explicitly enabled', () => {
    const granted = effectivePermissions({
      role: ROLES.DRAW_MANAGER,
      extraPermissions: [PERMISSIONS.DRAW_CONFIRM],
      deniedPermissions: [],
    });
    expect(granted).toContain(PERMISSIONS.DRAW_CONFIRM);
  });

  it('keeps the read-only viewer strictly read-only', () => {
    const viewer = permissionsForRole(ROLES.VIEWER);
    const mutating = [
      PERMISSIONS.CUSTOMER_CREATE,
      PERMISSIONS.CUSTOMER_UPDATE,
      PERMISSIONS.CUSTOMER_CLOSE,
      PERMISSIONS.PAYMENT_CREATE,
      PERMISSIONS.PAYMENT_REVERSE,
      PERMISSIONS.DRAW_CREATE,
      PERMISSIONS.DRAW_CONFIRM,
      PERMISSIONS.DRAW_CORRECT,
      PERMISSIONS.ADVANCE_CREATE,
      PERMISSIONS.ADVANCE_UPDATE,
      PERMISSIONS.INCOME_CREATE,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.EXPENSE_REVERSE,
      PERMISSIONS.PARTNER_TXN_CREATE,
      PERMISSIONS.TRANSFER_CREATE,
      PERMISSIONS.RECONCILIATION_CREATE,
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.SETTINGS_UPDATE,
      PERMISSIONS.REPORT_EXPORT,
    ];
    for (const p of mutating) expect(viewer).not.toContain(p);
    expect(viewer).toContain(PERMISSIONS.CUSTOMER_VIEW);
    expect(viewer).toContain(PERMISSIONS.REPORT_VIEW);
  });

  it('has a defined permission set for every role', () => {
    const map = rolePermissionMap();
    for (const role of ALL_ROLES) expect(Array.isArray(map[role])).toBe(true);
  });

  it('removes a denied permission from the effective set', () => {
    const perms = effectivePermissions({
      role: ROLES.OWNER,
      extraPermissions: [],
      deniedPermissions: [PERMISSIONS.PAYMENT_REVERSE],
    });
    expect(hasPermission(ROLES.OWNER, PERMISSIONS.PAYMENT_REVERSE)).toBe(true);
    expect(perms).not.toContain(PERMISSIONS.PAYMENT_REVERSE);
  });
});

describe('CNIC masking protects sensitive data', () => {
  it('normalises and formats a CNIC', () => {
    expect(normalizeCnic('54301-1234567-1')).toBe('5430112345671');
    expect(formatCnic('5430112345671')).toBe('54301-1234567-1');
  });

  it('masks the middle digits', () => {
    expect(maskCnic('5430112345671')).toBe('54*******671');
  });

  it('validates CNIC and Pakistani phone formats', () => {
    expect(isValidCnic('5430112345671')).toBe(true);
    expect(isValidCnic('54301-1234567-1')).toBe(true);
    expect(isValidCnic('12345')).toBe(false);

    expect(isValidPhone('03001234567')).toBe(true);
    expect(isValidPhone('+923001234567')).toBe(true);
    expect(isValidPhone('0300-1234567')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('abcdefg')).toBe(false);
  });
});

describe('partner transaction maths (PRD p.13)', () => {
  it('treats a withdrawal as cash leaving the showroom', () => {
    expect(partnerCashEffect('WITHDRAWAL', 2500000)).toBe(-2500000);
  });

  it('treats a contribution or repayment as cash entering the showroom', () => {
    expect(partnerCashEffect('CONTRIBUTION', 10000000)).toBe(10000000);
    expect(partnerCashEffect('REPAYMENT', 500000)).toBe(500000);
  });

  it('keeps a correction neutral until it is applied', () => {
    expect(partnerCashEffect('CORRECTION', 1000)).toBe(0);
  });
});

describe('cash and bank closing balance formula (PRD p.13)', () => {
  it('closing = opening + inflows - outflows', () => {
    expect(closingBalance(100000, 50000, 30000)).toBe(120000);
    expect(closingBalance(0, 0, 0)).toBe(0);
    expect(closingBalance(500000, 0, 700000)).toBe(-200000);
  });
});
