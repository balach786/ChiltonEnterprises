import {
  BadgeDollarSign,
  Banknote,
  BarChart3,
  CalendarClock,
  ClipboardList,
  Coins,
  CreditCard,
  Gauge,
  HandCoins,
  Landmark,
  ListChecks,
  ScrollText,
  Settings as SettingsIcon,
  Ticket,
  Users as UsersIcon,
  Wallet,
  DatabaseBackup,
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
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: Gauge, permission: PERMISSIONS.DASHBOARD_VIEW, end: true },
    ],
  },
  {
    title: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: UsersIcon, permission: PERMISSIONS.CUSTOMER_VIEW },
      { to: '/tokens', label: 'Token register', icon: Ticket, permission: PERMISSIONS.TOKEN_VIEW },
      { to: '/installments', label: 'Installments', icon: CalendarClock, permission: PERMISSIONS.INSTALLMENT_VIEW },
      { to: '/payments', label: 'Payments', icon: CreditCard, permission: PERMISSIONS.PAYMENT_VIEW },
    ],
  },
  {
    title: 'Scheme',
    items: [
      { to: '/draws', label: 'Qurandazi draws', icon: BadgeDollarSign, permission: PERMISSIONS.DRAW_VIEW },
      { to: '/advances', label: 'Advance bike / cash', icon: HandCoins, permission: PERMISSIONS.ADVANCE_VIEW },
      { to: '/lists', label: 'Automatic lists', icon: ListChecks, permission: PERMISSIONS.CUSTOMER_VIEW },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/income', label: 'Income & collections', icon: Coins, permission: PERMISSIONS.INCOME_VIEW },
      { to: '/expenses', label: 'Expenses', icon: Wallet, permission: PERMISSIONS.EXPENSE_VIEW },
      { to: '/partners', label: 'Partner accounts', icon: Landmark, permission: PERMISSIONS.PARTNER_VIEW },
      { to: '/cash-bank', label: 'Cash & bank', icon: Banknote, permission: PERMISSIONS.ACCOUNT_VIEW },
    ],
  },
  {
    title: 'Reporting',
    items: [
      { to: '/reports', label: 'Reports & exports', icon: BarChart3, permission: PERMISSIONS.REPORT_VIEW },
      { to: '/audit', label: 'Audit history', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Users & roles', icon: ClipboardList, permission: PERMISSIONS.USER_VIEW },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, permission: PERMISSIONS.SETTINGS_VIEW },
      { to: '/backup', label: 'Backup', icon: DatabaseBackup, permission: PERMISSIONS.SETTINGS_VIEW },
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
