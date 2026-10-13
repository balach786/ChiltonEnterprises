import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from 'recharts';
import {
  Bike,
  CalendarClock,
  CircleDollarSign,
  TrendingUp,
  Users,
  Wallet,
  ArrowUpRight,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { StatCard, WaveDecoration } from '@/components/shared/StatCard';
import { Money } from '@/components/shared/DataTable';
import { useDashboardCashPosition, useDashboardSummary } from '@/hooks/useApi';
import { cn, formatDateTime, monthStartIso, todayIso } from '@/lib/utils';

export function DashboardPage() {
  const [location, setLocation] = React.useState('ALL');
  const [from] = React.useState(monthStartIso());
  const [to] = React.useState(todayIso());

  const filters = React.useMemo(
    () => ({ location: location === 'ALL' ? undefined : location, dateFrom: from, dateTo: to }),
    [location, from, to]
  );

  const summary = useDashboardSummary(filters);
  const cash = useDashboardCashPosition();

  const data = summary.data;
  const loading = summary.isLoading;

  // Weekly bar data with vibrant individual gradients
  const barWeekly = [
    { day: 'Fri', label: 'Fri', height: '62%', val: 62, from: '#38bdf8', to: '#2563eb', shadow: 'rgba(37,99,235,0.3)' },
    { day: 'Thur', label: 'Thur', height: '48%', val: 48, from: '#34d399', to: '#059669', shadow: 'rgba(5,150,105,0.3)' },
    { day: 'Sat', label: 'Sat', height: '32%', val: 32, from: '#fbbf24', to: '#ea580c', shadow: 'rgba(234,88,12,0.3)' },
    { day: 'Tue', label: 'Tue', height: '70%', val: 70, from: '#c084fc', to: '#7c3aed', shadow: 'rgba(124,58,237,0.3)' },
    { day: 'Mon', label: 'Mon', height: '88%', val: 88, from: '#fb7185', to: '#e11d48', shadow: 'rgba(225,29,72,0.3)' },
  ];

  const inventoryDonut = [
    { name: 'SUV', value: 34, color: '#3b82f6', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
    { name: 'Truck', value: 18, color: '#10b981', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { name: 'Sedan', value: 24, color: '#8b5cf6', pill: 'bg-purple-50 text-purple-700 border-purple-200' },
    { name: 'Luxury', value: 14, color: '#f59e0b', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
    { name: 'Hatchback', value: 10, color: '#f43f5e', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  ];

  const recentVehiclesMock = [
    {
      id: '1',
      model: 'Honda Civic',
      type: 'SUV',
      status: 'Sold',
      price: '$150,000',
      customer: 'johe@gmail.com',
      date: '17/10/2026',
      isHighlighted: true,
      avatarGradient: 'from-sky-500 to-blue-600',
    },
    {
      id: '2',
      model: 'Honda Civic',
      type: 'SUV',
      status: 'Available',
      price: '$120,000',
      customer: 'jobe@gmail.com',
      date: '17/10/2026',
      isHighlighted: false,
      avatarGradient: 'from-emerald-500 to-teal-600',
    },
    {
      id: '3',
      model: 'Honda Miller',
      type: 'Luxury',
      status: 'Sold',
      price: '$130,000',
      customer: 'mike@gmail.com',
      date: '17/10/2026',
      isHighlighted: true,
      avatarGradient: 'from-purple-500 to-indigo-600',
    },
    {
      id: '4',
      model: 'Eroy Park',
      type: 'Luxury',
      status: 'Sold',
      price: '$150,000',
      customer: 'rocy@gmail.com',
      date: '17/10/2026',
      isHighlighted: false,
      avatarGradient: 'from-amber-500 to-orange-500',
    },
    {
      id: '5',
      model: 'Rosy Xim',
      type: 'Luxury',
      status: 'Available',
      price: '$150,000',
      customer: 'rosy@gmail.com',
      date: '17/10/2026',
      isHighlighted: true,
      avatarGradient: 'from-rose-500 to-pink-600',
    },
  ];

  const topSalesmen = [
    { name: 'Peter Parker', sales: '12 sales', color: 'from-amber-400 to-orange-500', rankBg: 'bg-amber-500' },
    { name: 'Anna Browa', sales: '10 sales', color: 'from-sky-400 to-indigo-500', rankBg: 'bg-slate-400' },
    { name: 'Nancy Doe', sales: '7 sales', color: 'from-purple-400 to-pink-500', rankBg: 'bg-amber-700' },
    { name: 'Alien Praker', sales: '6 sales', color: 'from-emerald-400 to-teal-500', rankBg: 'bg-slate-300' },
    { name: 'Alina Browa', sales: '3 sales', color: 'from-rose-400 to-red-400', rankBg: 'bg-slate-300' },
  ];

  const [tableSearch, setTableSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'Sold' | 'Available'>('ALL');
  const [statTimeRange, setStatTimeRange] = React.useState<'Week' | 'Month' | 'Year'>('Week');
  const [topTab, setTopTab] = React.useState<'salesman' | 'model'>('salesman');

  return (
    <div className="space-y-5 pb-6">
      {/* ================= TOP ROW: DATE FILTERS & FILTER BUTTON ================= */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/80 p-1 shadow-xs backdrop-blur border border-slate-100">
          {/* Date From */}
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-800">
            <CalendarClock className="h-3.5 w-3.5 text-rose-500" />
            <input
              type="text"
              value="17/10/2026"
              readOnly
              className="w-20 bg-transparent text-xs font-semibold text-rose-800 outline-none"
            />
          </div>

          <span className="px-0.5 font-bold text-slate-300">—</span>

          {/* Date To */}
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-800">
            <CalendarClock className="h-3.5 w-3.5 text-rose-500" />
            <input
              type="text"
              value="18/10/2026"
              readOnly
              className="w-20 bg-transparent text-xs font-semibold text-rose-800 outline-none"
            />
          </div>
        </div>

        {/* Filter Button */}
        <button
          type="button"
          className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/25 transition hover:shadow-md hover:from-blue-700 hover:to-indigo-700 active:scale-95"
        >
          Filter
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-8.5 w-32 text-xs bg-white rounded-xl border-slate-200 shadow-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All locations</SelectItem>
              <SelectItem value="MACH">Mach</SelectItem>
              <SelectItem value="QUETTA">Quetta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ================= 4 KPI CARDS (Vibrant & Colorful) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <StatCard
          label="Total Vehicles"
          variant="cyan"
          loading={loading}
          value={data?.tokens.total ? `${data.tokens.total}` : '350'}
          hint="Registered tokens in scheme"
          icon={<Bike className="h-6 w-6" />}
          to="/tokens"
        />
        <StatCard
          label="Available"
          variant="emerald"
          loading={loading}
          value={data?.tokens.unassigned ? `${data.tokens.unassigned}` : '180'}
          hint="Open for enrollment"
          icon={<CircleDollarSign className="h-6 w-6" />}
          to="/tokens"
        />
        <StatCard
          label="Sold This Month"
          variant="rose"
          loading={loading}
          value={data?.customers.active ? `${data.customers.active}` : '45'}
          hint="Active scheme enrollments"
          icon={<Users className="h-6 w-6" />}
          to="/customers"
        />
        <StatCard
          label="Sales Target"
          variant="purple"
          loading={loading}
          value="80"
          hint="Target goal for October"
          icon={<TrendingUp className="h-6 w-6" />}
          to="/payments"
        />
      </div>

      {/* ================= MIDDLE ROW: SALES STATISTIC & INVENTORY TYPE ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Sales Statistic Card (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-sky-100 bg-gradient-to-b from-white via-white to-sky-50/20 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Sales Overview</h3>
                <p className="text-[11px] font-medium text-slate-400">Weekly &amp; Monthly Performance</p>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              {(['Week', 'Month', 'Year'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatTimeRange(tab)}
                  className={`rounded-lg px-3 py-1 text-xs transition duration-150 ${
                    statTimeRange === tab
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 font-bold text-white shadow-sm shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Bar Chart with colorful gradient bars */}
          <div className="relative flex h-60 flex-col justify-end px-6 pt-6 pb-2">
            {/* Y Axis line */}
            <div className="absolute top-1 bottom-6 left-6 flex w-[1.5px] flex-col items-center bg-slate-400/80">
              <span className="-mt-1.5 h-0 w-0 border-r-[4px] border-b-[6px] border-l-[4px] border-r-transparent border-b-slate-600 border-l-transparent" />
            </div>

            {/* X Axis line */}
            <div className="absolute right-2 bottom-6 left-6 flex h-[1.5px] items-center justify-end bg-slate-400/80">
              <span className="-mr-1.5 h-0 w-0 border-t-[4px] border-b-[4px] border-l-[6px] border-t-transparent border-b-transparent border-l-slate-600" />
            </div>

            {/* Bars Container */}
            <div className="flex h-full items-end justify-around pl-4 pr-6 pb-2">
              {barWeekly.map((item) => (
                <div key={item.day} className="group flex h-full cursor-pointer flex-col items-center justify-end">
                  <span className="mb-1 text-[11px] font-bold text-slate-600 transition transform -rotate-12 group-hover:scale-110">
                    {item.label}
                  </span>
                  <div
                    style={{
                      height: item.height,
                      background: `linear-gradient(to top, ${item.from}, ${item.to})`,
                      boxShadow: `0 4px 12px ${item.shadow}`,
                    }}
                    className="relative w-8 sm:w-9 rounded-t-lg transition duration-200 group-hover:brightness-110 group-hover:scale-y-[1.02] origin-bottom"
                  >
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {item.val} units sold
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inventory Type Card (5 cols) */}
        <div className="lg:col-span-5 relative flex flex-col justify-between overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-b from-white via-white to-teal-50/20 pt-5 pr-5 pb-1 pl-5 shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/25">
                <Bike className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Inventory Distribution</h3>
                <p className="text-[11px] font-medium text-slate-400">Live breakdown by vehicle type</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
              {/* Legend list */}
              <div className="grid grid-cols-2 gap-2 text-xs w-full sm:w-auto">
                {inventoryDonut.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white/90 px-2.5 py-1.5 shadow-xs"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full shadow-xs"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-slate-700">{item.name}</span>
                    <span className="ml-auto font-bold text-slate-500 text-[11px]">{item.value}%</span>
                  </div>
                ))}
              </div>

              {/* Donut Chart */}
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryDonut}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {inventoryDonut.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      formatter={(val: number, name: string) => [`${val}%`, name]}
                      contentStyle={{
                        backgroundColor: '#1e3840',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontSize: '11px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="-mx-5 -mb-1 mt-2">
            <WaveDecoration strokes={['#0d9488', '#2dd4bf', '#99f6e4']} />
          </div>
        </div>
      </div>

      {/* ================= BOTTOM ROW: RECENT VEHICLES / SALES & TOP SALESMAN ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Recent Vehicles/Sales Table (8 cols) */}
        <div className="lg:col-span-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#1d353b] via-[#26444c] to-[#204a55] px-5 py-3 text-white">
            <div>
              <h3 className="text-sm font-bold tracking-wide">Recent Vehicles / Sales</h3>
              <p className="text-[10px] text-teal-200/80">Latest transaction logs</p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search model/customer…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-36 sm:w-44 rounded-full bg-white/95 pl-3.5 pr-7 py-1 text-xs text-slate-800 placeholder-slate-400 outline-none shadow-inner focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setStatusFilter((prev) => (prev === 'ALL' ? 'Sold' : prev === 'Sold' ? 'Available' : 'ALL'))
                }
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-blue-500/25 transition hover:from-blue-600 hover:to-indigo-700 active:scale-95"
              >
                <span>Filter By</span>
                {statusFilter !== 'ALL' && (
                  <span className="rounded bg-white/20 px-1.5 text-[10px]">{statusFilter}</span>
                )}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-700">
                  <th className="px-4 py-3 font-semibold">Vehicle Model</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Sale Price</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentVehiclesMock
                  .filter((row) => {
                    const matchesSearch =
                      row.model.toLowerCase().includes(tableSearch.toLowerCase()) ||
                      row.customer.toLowerCase().includes(tableSearch.toLowerCase()) ||
                      row.type.toLowerCase().includes(tableSearch.toLowerCase());
                    const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
                    return matchesSearch && matchesStatus;
                  })
                  .map((row, idx) => {
                    const isHighlighted = row.isHighlighted;
                    return (
                      <tr
                        key={row.id}
                        className={`transition ${
                          isHighlighted
                            ? 'bg-[#37545c] font-medium text-white hover:bg-[#2e474f]'
                            : idx % 2 === 0
                            ? 'bg-white text-slate-800 hover:bg-slate-50'
                            : 'bg-slate-50/40 text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <td className="flex items-center gap-2.5 px-4 py-2.5">
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr font-bold text-white text-[11px] shadow-sm',
                              row.avatarGradient
                            )}
                          >
                            {row.model.charAt(0)}
                          </div>
                          <span className="max-w-[130px] truncate font-bold">{row.model}</span>
                        </td>
                        <td className="px-3 py-2.5">{row.type}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
                              row.status === 'Sold'
                                ? isHighlighted
                                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : isHighlighted
                                ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                                : 'border-sky-200 bg-sky-50 text-sky-700'
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                row.status === 'Sold' ? 'bg-emerald-500' : 'bg-sky-500'
                              )}
                            />
                            {row.status}
                          </span>
                        </td>
                        <td className={cn('px-3 py-2.5 font-bold', isHighlighted ? 'text-teal-200' : 'text-emerald-700')}>
                          {row.price}
                        </td>
                        <td className="max-w-[150px] truncate px-4 py-2.5 opacity-90">{row.customer}</td>
                        <td className="px-4 py-2.5 text-right opacity-90">{row.date}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Salesman / Top Selling Model (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-indigo-100 bg-gradient-to-b from-white via-white to-indigo-50/20 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-4 flex items-center gap-4 border-b border-slate-200/80 pb-3">
            <button
              type="button"
              onClick={() => setTopTab('salesman')}
              className={`pb-1 text-xs font-bold transition ${
                topTab === 'salesman'
                  ? 'border-b-2 border-indigo-600 text-indigo-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Top Salesman
            </button>
            <button
              type="button"
              onClick={() => setTopTab('model')}
              className={`pb-1 text-xs font-bold transition ${
                topTab === 'model'
                  ? 'border-b-2 border-indigo-600 text-indigo-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Top Selling Model
            </button>
          </div>

          <div className="space-y-2">
            {topSalesmen.map((person, idx) => (
              <div
                key={person.name}
                className="flex items-center justify-between rounded-xl p-2 text-xs transition hover:bg-white hover:shadow-xs border border-transparent hover:border-indigo-100"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div
                      className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${person.color} font-bold text-white text-[11px] shadow-sm`}
                    >
                      {person.name.charAt(0)}
                    </div>
                    <span
                      className={cn(
                        'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-xs',
                        person.rankBg
                      )}
                    >
                      {idx + 1}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-800">{person.name}</span>
                    <p className="text-[10px] text-slate-400">Showroom Representative</p>
                  </div>
                </div>
                <span className="rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                  {person.sales}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Financial Ledger and Scheme Accounts below */}
      <div className="pt-2">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Live Accounts &amp; System Summary
        </h4>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Cash & Bank Balances */}
          <Card className="rounded-2xl border-emerald-100 bg-gradient-to-b from-white via-white to-emerald-50/20 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800">Cash &amp; Bank Balances</CardTitle>
                  <CardDescription className="text-[11px]">Real-time movement ledger</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {cash.isLoading && <p className="text-xs text-muted-foreground">Loading balances…</p>}
              {cash.data?.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-slate-700">{account.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">
                    <Money value={account.closingBalancePaisa} />
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 p-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20">
                <span>Combined Balance</span>
                <Money value={data?.balances.combined.paisa ?? 0} className="text-white" />
              </div>
            </CardContent>
          </Card>

          {/* Recent Ledger Transactions */}
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/20">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800">Recent Ledger Transactions</CardTitle>
                  <CardDescription className="text-[11px]">Posted cash movements across all accounts</CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="rounded-xl text-xs font-semibold hover:bg-slate-50 border-slate-200"
              >
                <Link to="/cash-bank">Open cash &amp; bank</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100">
                {data?.recentTransactions?.slice(0, 4).map((txn) => (
                  <li key={txn.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-semibold text-slate-800">{txn.label}</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">{formatDateTime(txn.date)}</span>
                    <Money value={txn.amountPaisa} className="font-bold text-emerald-700" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
