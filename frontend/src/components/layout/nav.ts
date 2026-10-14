import {
  Banknote,
  BarChart3,
  CalendarClock,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  LayoutGrid,
  ScrollText,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutGrid, permission: PERMISSIONS.DASHBOARD_VIEW, end: true },
      { to: '/customers', label: 'Customers & Tokens', icon: UsersIcon, permission: PERMISSIONS.CUSTOMER_VIEW },
      { to: '/payments', label: 'Installments & Payments', icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW },
      { to: '/draws', label: 'Monthly Draws', icon: CalendarClock, permission: PERMISSIONS.DRAW_VIEW },
      { to: '/advances', label: 'Advance Bike / Cash', icon: HandCoins, permission: PERMISSIONS.ADVANCE_VIEW },
      { to: '/income', label: 'Income & Collections', icon: Coins, permission: PERMISSIONS.INCOME_VIEW },
      { to: '/expenses', label: 'Expenses', icon: Wallet, permission: PERMISSIONS.EXPENSE_VIEW },
      { to: '/partners', label: 'Partner Accounts', icon: Landmark, permission: PERMISSIONS.PARTNER_VIEW },
      { to: '/cash-bank', label: 'Cash & Bank', icon: Banknote, permission: PERMISSIONS.ACCOUNT_VIEW },
      { to: '/reports', label: 'Reports & Exports', icon: BarChart3, permission: PERMISSIONS.REPORT_VIEW },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, permission: PERMISSIONS.SETTINGS_VIEW },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
];

export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/': PERMISSIONS.DASHBOARD_VIEW,
  '/customers': PERMISSIONS.CUSTOMER_VIEW,
  '/tokens': PERMISSIONS.TOKEN_VIEW,
  '/installments': PERMISSIONS.INSTALLMENT_VIEW,
  '/payments': PERMISSIONS.PAYMENT_VIEW,
  '/draws': PERMISSIONS.DRAW_VIEW,
  '/advances': PERMISSIONS.ADVANCE_VIEW,
  '/lists': PERMISSIONS.CUSTOMER_VIEW,
  '/income': PERMISSIONS.INCOME_VIEW,
  '/expenses': PERMISSIONS.EXPENSE_VIEW,
  '/partners': PERMISSIONS.PARTNER_VIEW,
  '/cash-bank': PERMISSIONS.ACCOUNT_VIEW,
  '/reports': PERMISSIONS.REPORT_VIEW,
  '/audit': PERMISSIONS.AUDIT_VIEW,
  '/users': PERMISSIONS.USER_VIEW,
  '/settings': PERMISSIONS.SETTINGS_VIEW,
  '/backup': PERMISSIONS.SETTINGS_VIEW,
};

/** The first route a given role should land on after signing in. */
export function homePathFor(permissions: Permission[]): string {
  for (const candidate of ['/', '/customers', '/tokens', '/payments', '/draws', '/reports']) {
    const permission = ROUTE_PERMISSIONS[candidate];
    if (permission && permissions.includes(permission)) return candidate;
  }
  return '/profile';
}
