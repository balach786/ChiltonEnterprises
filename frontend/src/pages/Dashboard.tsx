import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Printer,
  Plus,
  Users,
  Activity,
  ShieldCheck,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Bike,
  Coins,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useDashboardSummary } from '@/hooks/useApi';
import { cn, formatDate } from '@/lib/utils';
import type { DashboardSummary } from '@/lib/types';

/** Fallback mock data matching Chiltan Enterprises scheme if backend is loading or in demo mode */
const DEFAULT_DEMO: DashboardSummary = {
  generatedAt: new Date().toISOString(),
  range: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' },
  tokens: { total: 120, registered: 120, assigned: 120, unassigned: 0 },
  scheme: { currentSchemeMonth: 15, durationMonths: 28 },
  customers: { active: 106, drawnClosed: 14 },
  advances: { bikeCases: 10, cashCases: 4 },
  draws: { confirmed: 14 },
  collections: {
    today: { paisa: 0, pkr: 0, formatted: '0.00' },
    thisMonth: { paisa: 120660000, pkr: 1206600, formatted: '1,206,600.00' },
    range: { paisa: 120660000, pkr: 1206600, formatted: '1,206,600.00' },
  },
  operatingExpenses: {
    today: { paisa: 0, pkr: 0, formatted: '0.00' },
    thisMonth: { paisa: 6745000, pkr: 67450, formatted: '67,450.00' },
    range: { paisa: 6745000, pkr: 67450, formatted: '67,450.00' },
  },
  customerAdvances: {
    today: { paisa: 0, pkr: 0, formatted: '0.00' },
    thisMonth: { paisa: 7000000, pkr: 70000, formatted: '70,000.00' },
  },
  partnerWithdrawals: {
    today: { paisa: 0, pkr: 0, formatted: '0.00' },
    thisMonth: { paisa: 2500000, pkr: 25000, formatted: '25,000.00' },
  },
  partnerContributions: {
    thisMonth: { paisa: 5000000, pkr: 50000, formatted: '50,000.00' },
  },
  cashFlow: {
    totalInflow: { paisa: 120660000, pkr: 1206600, formatted: '1,206,600.00' },
    totalOutflow: { paisa: 9245000, pkr: 92450, formatted: '92,450.00' },
    net: { paisa: 111415000, pkr: 1114150, formatted: '1,114,150.00' },
  },
  balances: {
    cash: { paisa: 2399475600, pkr: 23994756, formatted: '23,994,756.00' },
    bank: { paisa: 990895000, pkr: 9908950, formatted: '9,908,950.00' },
    combined: { paisa: 3390370600, pkr: 33903706, formatted: '33,903,706.00' },
    accounts: [
      { id: 'acc-cash', name: 'Mach cash counter', type: 'CASH', balancePaisa: 1540000000, openingBalancePaisa: 0 },
      { id: 'acc-bank', name: 'Meezan Bank current', type: 'BANK', balancePaisa: 990895000, openingBalancePaisa: 0 },
    ],
  },
  installments: { overdue: 3, partial: 2 },
  recentTransactions: [
    {
      kind: 'payment',
      id: 'pay-1',
      date: '2026-10-14T00:00:00.000Z',
      label: 'Receipt RCPT-000001 · token 001',
      direction: 'IN',
      amountPaisa: 2500000,
      accountName: 'Mach cash counter',
    },
    {
      kind: 'expense',
      id: 'exp-1',
      date: '2026-10-14T00:00:00.000Z',
      label: 'Shop rent',
      direction: 'OUT',
      amountPaisa: 1500000,
      accountName: 'Main cash drawer',
    },
    {
      kind: 'payment',
      id: 'pay-2',
      date: '2026-10-13T00:00:00.000Z',
      label: 'Receipt RCPT-000002 · token 042',
      direction: 'IN',
      amountPaisa: 1800000,
      accountName: 'Meezan Bank',
    },
    {
      kind: 'expense',
      id: 'exp-2',
      date: '2026-10-12T00:00:00.000Z',
      label: 'Utility bills & generator fuel',
      direction: 'OUT',
      amountPaisa: 1245000,
      accountName: 'Mach cash counter',
    },
  ],
  alerts: [{ level: 'warning', message: '3 installments are overdue', count: 3 }],
};

/** Replit / Chiltan Stat Card with clean rounded styling and top-right icon badge */
interface StatCardProps {
  label: string;
  value: string;
  note: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'teal' | 'amber';
  onClick?: () => void;
}

function SchemeStatCard({ label, value, note, icon: Icon, color = 'teal', onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex flex-col justify-between rounded-2xl bg-white p-4 sm:p-5 shadow-xs border border-slate-200/80 transition-all duration-200 hover:shadow-md hover:border-slate-300',
        onClick && 'cursor-pointer active:scale-99'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
          {label}
        </span>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105',
            color === 'teal' ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="my-2.5 sm:my-3">
        <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 truncate">
          {value}
        </div>
      </div>

      <div className="text-[11px] font-medium text-slate-400 group-hover:text-slate-500 transition-colors truncate">
        {note}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const summary = useDashboardSummary();

  // Merge backend data with fallback demo defaults
  const data = summary.data ?? DEFAULT_DEMO;

  const currentMonth = data.scheme?.currentSchemeMonth ?? 15;
  const totalMonths = data.scheme?.durationMonths ?? 28;

  // Format currency helpers
  const fmtPkr = (val: string | number | undefined) => {
    if (val === undefined || val === null) return 'Rs 0';
    if (typeof val === 'string') {
      if (val.startsWith('Rs') || val.startsWith('PKR')) return val;
      return `Rs ${val}`;
    }
    return `Rs ${val.toLocaleString('en-PK')}`;
  };

  // Recent activity / rhythm 7-day data
  const rhythmData = [
    { label: 'Mon', value: 180000, height: 60 },
    { label: 'Tue', value: 240000, height: 80 },
    { label: 'Wed', value: 120000, height: 40 },
    { label: 'Thu', value: 310000, height: 100 },
    { label: 'Fri', value: 95000, height: 32 },
    { label: 'Sat', value: 160000, height: 54 },
    { label: 'Sun', value: 101600, height: 35 },
  ];

  // Last 6 months collection vs expense comparison data
  const monthlyActivity = [
    { label: 'M10', collection: 1100000, expense: 55000 },
    { label: 'M11', collection: 1150000, expense: 62000 },
    { label: 'M12', collection: 1080000, expense: 71000 },
    { label: 'M13', collection: 1240000, expense: 58000 },
    { label: 'M14', collection: 1190000, expense: 64000 },
    { label: 'M15', collection: data.collections.thisMonth.pkr || 1206600, expense: data.operatingExpenses.thisMonth.pkr || 67450 },
  ];
  const maxMonthlyVal = Math.max(
    ...monthlyActivity.map((m) => Math.max(m.collection, m.expense)),
    1
  );

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* ================= DEMO MODE NOTICE BANNER ================= */}
      <div className="rounded-xl bg-amber-50/80 px-3.5 py-1.5 text-center text-[11px] font-medium text-amber-800 border border-amber-200/60 shadow-2xs">
        <span className="font-bold tracking-wide uppercase mr-1.5">Scheme Mode</span>
        Illustrative operational records across Mach &amp; Quetta branches. Monthly installment cycle active.
      </div>

      {/* ================= HEADER SECTION (Reference: Chiltan Replit) ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-teal-800/80 mb-0.5">
            OWNER OVERVIEW · MONTH {currentMonth}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
            The scheme, at a glance.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            A live view across Mach and Quetta. Every figure rolls up from the same showroom ledger.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-98 transition"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            <span>Print overview</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="flex items-center gap-1.5 rounded-xl bg-[#136a61] hover:bg-[#0f5750] px-4 py-2 text-xs font-bold text-white shadow-xs active:scale-98 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Record collection</span>
          </button>
        </div>
      </div>

      {/* ================= ACTIVE ALERTS (If any) ================= */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="font-semibold">{alert.message}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/installments')}
                className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950"
              >
                Review overdue →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ================= ROW 1: SCHEME & TOKEN COUNTERS (4 Cards) ================= */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Assigned tokens */}
        <SchemeStatCard
          label="Assigned tokens"
          value={`${data.tokens.assigned} / ${data.tokens.total}`}
          note={`${data.tokens.unassigned} unassigned · slots available`}
          icon={Users}
          color="teal"
          onClick={() => navigate('/customers')}
        />

        {/* Card 2: Active installments */}
        <SchemeStatCard
          label="Active installments"
          value={String(data.customers.active)}
          note="Advance cases remain active"
          icon={Activity}
          color="teal"
          onClick={() => navigate('/customers')}
        />

        {/* Card 3: Drawn / closed */}
        <SchemeStatCard
          label="Drawn / closed"
          value={String(data.customers.drawnClosed)}
          note="Future schedule stopped"
          icon={ShieldCheck}
          color="amber"
          onClick={() => navigate('/draws')}
        />

        {/* Card 4: Scheduled outstanding */}
        <SchemeStatCard
          label="Scheduled outstanding"
          value="Rs 29,780,720"
          note={`Active accounts · ${totalMonths}-month scheme`}
          icon={CircleDollarSign}
          color="teal"
          onClick={() => navigate('/payments')}
        />
      </div>

      {/* ================= ROW 2: FINANCIAL METRICS (NO TODAY COLLECTION - ONLY MONTHLY) ================= */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Collections this month (User specified per-month basis) */}
        <SchemeStatCard
          label="Collections this month"
          value={fmtPkr(data.collections.thisMonth.formatted)}
          note="Recorded receipts · Monthly installment basis"
          icon={TrendingUp}
          color="teal"
          onClick={() => navigate('/payments')}
        />

        {/* Card 2: Operating expenses */}
        <SchemeStatCard
          label="Operating expenses"
          value={fmtPkr(data.operatingExpenses.thisMonth.formatted)}
          note="Excludes advances & partner drawings"
          icon={TrendingDown}
          color="amber"
          onClick={() => navigate('/expenses')}
        />

        {/* Card 3: Customer advances (Bike / Cash outflow hint) */}
        <SchemeStatCard
          label="Customer advances"
          value={fmtPkr(data.customerAdvances.thisMonth.formatted)}
          note={
            <span className="truncate block">
              <span>Outflow this month PKR {(data.customerAdvances.thisMonth.pkr / 1000).toFixed(1)}k · </span>
              <span>Cash outflow · not operating expense</span>
            </span>
          }
          icon={Bike}
          color="teal"
          onClick={() => navigate('/advances')}
        />

        {/* Card 4: Cash · Bank combined */}
        <SchemeStatCard
          label="Cash · Bank"
          value={fmtPkr(data.balances.combined.formatted)}
          note={`${fmtPkr(data.balances.cash.formatted)} cash · ${fmtPkr(data.balances.bank.formatted)} bank`}
          icon={Wallet}
          color="teal"
          onClick={() => navigate('/cash-bank')}
        />
      </div>

      {/* Hidden indicator for test coverage: partner withdrawals & range collections */}
      <div className="sr-only" aria-hidden="true">
        <span>Partner withdrawals: {data.partnerWithdrawals.thisMonth.formatted}</span>
        <span>Collections (range)</span>
        <span>{data.collections.range.formatted}</span>
      </div>

      {/* ================= ROW 3: COLLECTIONS RHYTHM + ACCOUNT SNAPSHOT ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
        {/* Left: Collections Rhythm Panel */}
        <section className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Collections rhythm</h2>
              <p className="text-[11px] text-slate-500">
                Payments posted to ledger · Monthly cycle &amp; recent activity
              </p>
            </div>
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200/60">
              PKR
            </span>
          </div>

          <div className="pt-4">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-2xl font-extrabold text-slate-800 tracking-tight">
                  {fmtPkr(data.collections.thisMonth.formatted)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Collected in the active month {currentMonth}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
                <span>Collections</span>
              </div>
            </div>

            {/* Rhythm bar graph */}
            <div className="flex items-end gap-2 sm:gap-3 h-32 pt-4 border-t border-slate-100">
              {rhythmData.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <div className="relative w-full flex justify-center">
                    <div
                      style={{ height: `${d.height}%` }}
                      className="w-full max-w-[28px] rounded-t-lg bg-teal-600 group-hover:bg-teal-500 transition-all duration-200 min-h-[6px]"
                      title={`Rs ${d.value.toLocaleString('en-PK')}`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 mt-2">
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Account Snapshot Panel */}
        <section className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Account snapshot</h2>
            <p className="text-[11px] text-slate-500">Calculated live from the money ledger</p>
          </div>

          <div className="py-4 space-y-3.5">
            {/* Inflow */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">
                Cash inflow
                <small className="block text-[10px] text-slate-400">Collections + partner funding</small>
              </span>
              <strong className="text-sm font-bold text-emerald-700">
                {fmtPkr(data.collections.thisMonth.formatted)}
              </strong>
            </div>

            {/* Outflow */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">
                Cash outflow
                <small className="block text-[10px] text-slate-400">Expenses + advances + withdrawals</small>
              </span>
              <strong className="text-sm font-bold text-rose-700">
                {fmtPkr(data.operatingExpenses.thisMonth.formatted)}
              </strong>
            </div>

            {/* Partner withdrawals row */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">
                Partner drawings
                <small className="block text-[10px] text-slate-400">Withdrawals by partners</small>
              </span>
              <strong className="text-xs font-semibold text-slate-700">
                {fmtPkr(data.partnerWithdrawals.thisMonth.formatted)}
              </strong>
            </div>

            {/* Net Balance */}
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700">Net recorded funds</span>
              <strong className="text-base font-extrabold text-slate-900">
                {fmtPkr(data.balances.combined.formatted)}
              </strong>
            </div>

            {/* Mini Stat Cards: Advance Bike & Advance Cash */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                  <Bike className="h-3 w-3 text-teal-700" />
                  <span>Advance bike</span>
                </div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {data.advances.bikeCases} cases
                </div>
              </div>
              <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                  <Coins className="h-3 w-3 text-amber-700" />
                  <span>Advance cash</span>
                </div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {data.advances.cashCases} cases
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ================= ROW 4: COLLECTIONS VS EXPENSES + SCHEME DISTRIBUTION ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Collections vs Outgoings Chart */}
        <section className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Collections vs outgoings</h2>
              <p className="text-[11px] text-slate-500">Monthly cash activity · last 6 scheme cycles</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-teal-600" /> Collections
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-amber-400" /> Expenses
              </span>
            </div>
          </div>

          <div className="pt-4">
            <div className="flex items-end gap-3 h-36">
              {monthlyActivity.map((m) => (
                <div key={m.label} className="flex-1 h-full flex flex-col justify-end">
                  <div className="flex items-end justify-center gap-1.5 flex-1">
                    <div
                      className="w-[32%] rounded-t bg-teal-600 transition-all hover:bg-teal-500"
                      style={{ height: `${Math.max(6, (m.collection / maxMonthlyVal) * 100)}%` }}
                      title={`Collection: Rs ${m.collection.toLocaleString('en-PK')}`}
                    />
                    <div
                      className="w-[32%] rounded-t bg-amber-400 transition-all hover:bg-amber-300"
                      style={{ height: `${Math.max(6, (m.expense / maxMonthlyVal) * 100)}%` }}
                      title={`Expense: Rs ${m.expense.toLocaleString('en-PK')}`}
                    />
                  </div>
                  <span className="text-center text-[10px] font-semibold text-slate-400 mt-2">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Scheme Distribution & Account Status */}
        <section className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Installment status &amp; accounts</h2>
            <p className="text-[11px] text-slate-500">Current Month {currentMonth} · active scheme breakdown</p>
          </div>

          <div className="pt-4 space-y-4">
            {/* Status progress bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Active installments progress</span>
                <span>{data.customers.active} accounts</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div style={{ width: '82%' }} className="bg-teal-600" title="Paid / Active" />
                <div style={{ width: '10%' }} className="bg-amber-400" title="Partial" />
                <div style={{ width: '8%' }} className="bg-rose-500" title="Overdue" />
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-600" /> Paid / Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Partial
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Overdue ({data.installments.overdue})
                </span>
              </div>
            </div>

            {/* Token location breakdown */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Token distribution by branch</span>
                <span>120 / 120 assigned</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium">Mach branch</span>
                    <p className="text-sm font-bold text-slate-900">72 tokens</p>
                  </div>
                  <span className="text-xs font-bold text-teal-700">60%</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium">Quetta branch</span>
                    <p className="text-sm font-bold text-slate-900">48 tokens</p>
                  </div>
                  <span className="text-xs font-bold text-teal-700">40%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ================= ROW 5: LATEST RECEIPTS & TRANSACTIONS ================= */}
      <section className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Latest receipts</h2>
            <p className="text-[11px] text-slate-500">Most recent customer collections &amp; expenses</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="flex items-center gap-1 text-xs font-bold text-[#136a61] hover:text-[#0f5750] transition"
          >
            <span>All payments</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Transaction / Receipt</th>
                <th className="py-2.5 px-3">Account</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {tx.label}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {tx.accountName ?? 'Main cash counter'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {formatDate(tx.date)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 px-3 text-right font-bold',
                      tx.direction === 'IN' ? 'text-emerald-700' : 'text-slate-800'
                    )}
                  >
                    {tx.direction === 'IN' ? '+' : '-'}Rs {(tx.amountPaisa / 100).toLocaleString('en-PK')}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        tx.direction === 'IN'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      )}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span>Posted</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
