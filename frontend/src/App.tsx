import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAuth, RequirePermission, Forbidden } from '@/components/layout/guards';
import { PERMISSIONS } from '@/lib/permissions';
import { RouteFallback } from '@/components/layout/RouteFallback';
// Every route (including login) is its own chunk: the initial download stays small enough to
// stay usable on a slow connection, and authenticated users never pay for the login form,
// react-hook-form or zod.
const LoginPage = React.lazy(() => import('@/pages/Login').then((m) => ({ default: m.LoginPage })));

const DashboardPage = React.lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const CustomerListPage = React.lazy(() => import('@/pages/customers/CustomerList').then((m) => ({ default: m.CustomerListPage })));
const CustomerDetailPage = React.lazy(() => import('@/pages/customers/CustomerDetail').then((m) => ({ default: m.CustomerDetailPage })));
const TokensPage = React.lazy(() => import('@/pages/Tokens').then((m) => ({ default: m.TokensPage })));
const InstallmentsPage = React.lazy(() => import('@/pages/Installments').then((m) => ({ default: m.InstallmentsPage })));
const PaymentsPage = React.lazy(() => import('@/pages/Payments').then((m) => ({ default: m.PaymentsPage })));
const DrawsPage = React.lazy(() => import('@/pages/draws/Draws').then((m) => ({ default: m.DrawsPage })));
const AdvancesPage = React.lazy(() => import('@/pages/advances/Advances').then((m) => ({ default: m.AdvancesPage })));
const IncomePage = React.lazy(() => import('@/pages/Income').then((m) => ({ default: m.IncomePage })));
const ExpensesPage = React.lazy(() => import('@/pages/Expenses').then((m) => ({ default: m.ExpensesPage })));
const PartnersPage = React.lazy(() => import('@/pages/Partners').then((m) => ({ default: m.PartnersPage })));
const CashBankPage = React.lazy(() => import('@/pages/finance/CashBank').then((m) => ({ default: m.CashBankPage })));
const AutomaticListsPage = React.lazy(() => import('@/pages/AutomaticLists').then((m) => ({ default: m.AutomaticListsPage })));
const ReportsPage = React.lazy(() => import('@/pages/reports/Reports').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = React.lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));
const UsersPage = React.lazy(() => import('@/pages/admin/Users').then((m) => ({ default: m.UsersPage })));
const AuditLogPage = React.lazy(() => import('@/pages/admin/AuditLog').then((m) => ({ default: m.AuditLogPage })));
const BackupPage = React.lazy(() => import('@/pages/admin/Backup').then((m) => ({ default: m.BackupPage })));
const ProfilePage = React.lazy(() => import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })));
const NotFoundPage = React.lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

export default function App() {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<RequirePermission permission={PERMISSIONS.DASHBOARD_VIEW}><DashboardPage /></RequirePermission>} />
          <Route path="/customers" element={<RequirePermission permission={PERMISSIONS.CUSTOMER_VIEW}><CustomerListPage /></RequirePermission>} />
          <Route path="/customers/:id" element={<RequirePermission permission={PERMISSIONS.CUSTOMER_VIEW}><CustomerDetailPage /></RequirePermission>} />
          <Route path="/tokens" element={<RequirePermission permission={PERMISSIONS.TOKEN_VIEW}><TokensPage /></RequirePermission>} />
          <Route path="/installments" element={<RequirePermission permission={PERMISSIONS.INSTALLMENT_VIEW}><InstallmentsPage /></RequirePermission>} />
          <Route path="/payments" element={<RequirePermission permission={PERMISSIONS.PAYMENT_VIEW}><PaymentsPage /></RequirePermission>} />
          <Route path="/draws" element={<RequirePermission permission={PERMISSIONS.DRAW_VIEW}><DrawsPage /></RequirePermission>} />
          <Route path="/advances" element={<RequirePermission permission={PERMISSIONS.ADVANCE_VIEW}><AdvancesPage /></RequirePermission>} />
          <Route path="/lists" element={<RequirePermission permission={PERMISSIONS.CUSTOMER_VIEW}><AutomaticListsPage /></RequirePermission>} />
          <Route path="/income" element={<RequirePermission permission={PERMISSIONS.INCOME_VIEW}><IncomePage /></RequirePermission>} />
          <Route path="/expenses" element={<RequirePermission permission={PERMISSIONS.EXPENSE_VIEW}><ExpensesPage /></RequirePermission>} />
          <Route path="/partners" element={<RequirePermission permission={PERMISSIONS.PARTNER_VIEW}><PartnersPage /></RequirePermission>} />
          <Route path="/cash-bank" element={<RequirePermission permission={PERMISSIONS.ACCOUNT_VIEW}><CashBankPage /></RequirePermission>} />
          <Route path="/reports" element={<RequirePermission permission={PERMISSIONS.REPORT_VIEW}><ReportsPage /></RequirePermission>} />
          <Route path="/audit" element={<RequirePermission permission={PERMISSIONS.AUDIT_VIEW}><AuditLogPage /></RequirePermission>} />
          <Route path="/users" element={<RequirePermission permission={PERMISSIONS.USER_VIEW}><UsersPage /></RequirePermission>} />
          <Route path="/settings" element={<RequirePermission permission={PERMISSIONS.SETTINGS_VIEW}><SettingsPage /></RequirePermission>} />
          <Route path="/backup" element={<RequirePermission permission={PERMISSIONS.SETTINGS_VIEW}><BackupPage /></RequirePermission>} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/forbidden" element={<Forbidden />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/403" element={<Forbidden />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}
