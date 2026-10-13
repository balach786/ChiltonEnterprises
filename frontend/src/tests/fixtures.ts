/**
 * Fixtures mirror the exact payloads the Express API returns (captured against a
 * running server + seeded database). Keeping them literal means a page test fails
 * when the API contract changes instead of silently rendering empty cards.
 */
import { ALL_PERMISSIONS } from '@/lib/permissions';
import type {
  AuthUser,
  CashPositionRow,
  CollectionsPanel,
  DashboardSummary,
  ExpensesPanel,
  SettingsMeta,
  TokenRow,
  TokenRegister,
} from '@/lib/types';

export const OWNER = 'owner';

export const meOwner: AuthUser = {
  _id: '6acb065a7fbd4eed18924000',
  name: 'System Administrator',
  email: 'admin@showroom.local',
  role: OWNER,
  isActive: true,
  extraPermissions: [],
  deniedPermissions: [],
  mustChangePassword: false,
  // The owner role holds the whole catalogue - taken from the shared constant so the
  // fixture can never drift from the permission strings the API issues.
  permissions: [...ALL_PERMISSIONS],
};

/** The token register is always exactly 120 rows, codes 001-120. */
export function tokenRegister(assigned = 2): TokenRegister {
  const items: TokenRow[] = Array.from({ length: 120 }, (_, index) => {
    const number = index + 1;
    const isAssigned = number <= assigned;
    return {
      _id: `token-${number}`,
      number,
      code: String(number).padStart(3, '0'),
      status: isAssigned ? 'assigned' : 'unassigned',
      assignmentHistoryCount: isAssigned ? 1 : 0,
      currentAssignment: isAssigned
        ? {
            enrollmentId: `enrollment-${number}`,
            customerId: `customer-${number}`,
            customerName: number === 1 ? 'Sanaullah Khan' : 'Abdul Rehman',
            location: number === 1 ? 'MACH' : 'QUETTA',
            status: 'active',
            startDate: '2026-09-01T00:00:00.000Z',
          }
        : null,
    } as TokenRow;
  });
  return { total: 120, assigned, unassigned: 120 - assigned, items };
}

const money = (paisa: number) => ({
  paisa,
  pkr: paisa / 100,
  formatted: (paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
});

export const dashboardSummary: DashboardSummary = {
  generatedAt: '2026-10-11T04:01:48.162Z',
  range: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' },
  tokens: { total: 120, registered: 120, assigned: 6, unassigned: 114 },
  scheme: { currentSchemeMonth: 1, durationMonths: 28 },
  customers: { active: 6, drawnClosed: 1 },
  advances: { bikeCases: 1, cashCases: 1 },
  draws: { confirmed: 1 },
  collections: { today: money(20050000), thisMonth: money(20050000), range: money(20050000) },
  operatingExpenses: { today: money(1810000), thisMonth: money(1810000), range: money(1810000) },
  customerAdvances: { today: money(4500000), thisMonth: money(7000000) },
  partnerWithdrawals: { today: money(2500000), thisMonth: money(2500000) },
  partnerContributions: { thisMonth: money(5000000) },
  cashFlow: { totalInflow: money(25050000), totalOutflow: money(11310000), net: money(13740000) },
  balances: {
    cash: money(9100000),
    bank: money(6400000),
    combined: money(15500000),
    accounts: [
      { id: 'acc-cash', name: 'Main cash drawer', type: 'CASH', balancePaisa: 9100000, openingBalancePaisa: 0 },
      { id: 'acc-bank', name: 'Meezan Bank current', type: 'BANK', balancePaisa: 6400000, openingBalancePaisa: 0 },
    ],
  },
  installments: { overdue: 3, partial: 2 },
  recentTransactions: [
    {
      kind: 'payment',
      id: 'pay-1',
      date: '2026-10-10T00:00:00.000Z',
      label: 'Receipt RCPT-000001 · token 001',
      direction: 'IN',
      amountPaisa: 2500000,
      accountName: 'Main cash drawer',
    },
    {
      kind: 'expense',
      id: 'exp-1',
      date: '2026-10-10T00:00:00.000Z',
      label: 'Shop rent',
      direction: 'OUT',
      amountPaisa: 1500000,
      accountName: 'Main cash drawer',
    },
  ],
  alerts: [{ level: 'warning', message: '3 installments are overdue', count: 3 }],
};

export const collectionsPanel: CollectionsPanel = {
  monthly: [
    { label: 'Sep 2026', totalPaisa: 15000000, count: 4 },
    { label: 'Oct 2026', totalPaisa: 20050000, count: 6 },
  ],
  daily: [
    { label: '2026-10-09', collectionsPaisa: 5000000, expensesPaisa: 200000 },
    { label: '2026-10-10', collectionsPaisa: 15050000, expensesPaisa: 1610000 },
  ],
  byLocation: [
    { location: 'MACH', totalPaisa: 12000000, count: 4 },
    { location: 'QUETTA', totalPaisa: 8050000, count: 2 },
  ],
  byInstallmentMonth: [
    { monthNumber: 1, totalPaisa: 10000000, count: 4 },
    { monthNumber: 2, totalPaisa: 10050000, count: 2 },
  ],
};

export const expensesPanel: ExpensesPanel = {
  daily: [
    { label: '2026-10-09', collectionsPaisa: 5000000, expensesPaisa: 200000 },
    { label: '2026-10-10', collectionsPaisa: 15050000, expensesPaisa: 1610000 },
  ],
  byCategory: [
    { category: 'SHOP_RENT', totalPaisa: 1500000, operatingPaisa: 1500000, count: 1 },
    { category: 'CUSTOMER_ADVANCE', totalPaisa: 4500000, operatingPaisa: 0, count: 1 },
  ],
};

export const cashPosition: CashPositionRow[] = [
  {
    accountId: 'acc-cash',
    name: 'Main cash drawer',
    type: 'CASH',
    openingBalancePaisa: 0,
    inflowPaisa: 20050000,
    outflowPaisa: 6310000,
    closingBalancePaisa: 13740000,
    calculatedClosingPaisa: 13740000,
  } as CashPositionRow,
];

export const settingsMeta: SettingsMeta = {
  settings: {
    _id: 'settings-1',
    businessName: 'Mach Motorcycle Showroom',
    receiptPrefix: 'RCPT',
    receiptSeqPadding: 6,
    currentSchemeMonth: 1,
    defaultSchemeDurationMonths: 28,
    duplicateCnicPolicy: 'block',
    allowPartialPayments: true,
    allowMultipleMonthPayments: true,
    autoCloseOnDraw: true,
    cnicMaskingEnabled: true,
    locations: ['MACH', 'QUETTA'],
    paymentMethods: ['CASH', 'BANK', 'CHEQUE', 'ONLINE', 'OTHER'],
    incomeCategories: ['INSTALLMENT_COLLECTION', 'OTHER'],
    expenseCategories: ['SHOP_RENT', 'UTILITIES'],
  } as SettingsMeta['settings'],
  tokenSlots: 120,
  installmentMonths: 28,
  locations: ['MACH', 'QUETTA'],
  currency: 'PKR',
};

/** Route table used by the mocked API layer in page tests. */
export const apiFixtures: Record<string, unknown> = {
  '/api/auth/me': meOwner,
  '/api/tokens': tokenRegister(2),
  '/api/settings/meta': settingsMeta,
  '/api/dashboard/summary': dashboardSummary,
  '/api/dashboard/collections': collectionsPanel,
  '/api/dashboard/expenses': expensesPanel,
  '/api/dashboard/cash-position': cashPosition,
};
