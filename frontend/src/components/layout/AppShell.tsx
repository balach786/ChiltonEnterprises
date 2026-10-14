import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  User as UserIcon,
  X,
  Search,
  Bell,
  Users,
  Ticket,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
import { homePathFor, NAV } from './nav';
import { cn, titleCase } from '@/lib/utils';

// Loaded as its own chunk: ~80 KB gzipped that the first paint should not have to wait for.
const Toaster = React.lazy(() => import('sonner').then((m) => ({ default: m.Toaster })));

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner / Administrator',
  accountant: 'Accountant',
  customer_service: 'Customer-Service Staff',
  draw_manager: 'Draw Manager',
  viewer: 'Read-Only Viewer',
};

/** Floating tooltip displayed on hover when the sidebar is collapsed (SchoolsGhar style) */
function NavTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute left-full ml-3 hidden rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-white/20 group-hover/item:block z-50 whitespace-nowrap backdrop-blur-sm animate-in fade-in slide-in-from-left-2 duration-150">
      {label}
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900/95" />
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [topSearch, setTopSearch] = React.useState('');

  // Desktop sidebar collapsed state with local storage persistence (SchoolsGhar pattern)
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('showroom_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('showroom_sidebar_collapsed', String(collapsed));
    } catch {
      // Ignore localStorage errors
    }
  }, [collapsed]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);

  // Helper to determine active state for nav items
  const isRouteActive = (to: string, end?: boolean) => {
    if (end || to === '/') {
      return location.pathname === to;
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  // Helper to resolve current page title for the desktop topbar
  const getPageTitle = (): string => {
    const currentPath = location.pathname;
    if (currentPath === '/') return 'Dashboard';
    for (const section of NAV) {
      for (const item of section.items) {
        if (item.to === currentPath || (item.to !== '/' && currentPath.startsWith(item.to))) {
          return item.label;
        }
      }
    }
    if (currentPath.startsWith('/profile')) return 'Profile & Password';
    return 'Showroom Management';
  };

  return (
    <div className="flex min-h-screen w-screen max-w-full overflow-x-hidden bg-[#edf3f6] text-slate-800 antialiased font-sans">
      {/* ================= DESKTOP FIXED SIDEBAR (SchoolsGhar Reference) ================= */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 hidden bg-[#26444c] text-white shadow-xl select-none transition-all duration-300 ease-in-out lg:flex flex-col',
          collapsed ? 'w-[72px]' : 'w-[224px]'
        )}
      >
        {/* Top Header: Logo & Collapse Button */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-white/10 transition-all duration-300',
            collapsed ? 'justify-center px-2' : 'justify-between px-3.5'
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="group flex flex-col items-center gap-1 py-1 focus:outline-none"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#26444c] shadow-md ring-2 ring-white/20 transition-transform group-hover:scale-105">
                <LayoutGrid className="h-5 w-5 text-teal-700" />
              </div>
              <ChevronRight className="h-3 w-3 text-white/70 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
            </button>
          ) : (
            <>
              <div
                onClick={() => navigate('/')}
                className="flex items-center gap-2.5 cursor-pointer min-w-0 group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 group-hover:bg-white/20 transition">
                  <LayoutGrid className="h-4.5 w-4.5 text-teal-300" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-base tracking-wide text-white drop-shadow-sm leading-tight block truncate">
                    Chiltan
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-widest text-teal-200/70 block -mt-0.5">
                    Enterprises · Scheme
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10 rounded-lg shrink-0 flex items-center justify-center transition-colors"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Scrollable Navigation Items */}
        <nav className="flex-1 min-h-0 space-y-3 overflow-y-auto overflow-x-visible pl-2.5 pr-0 py-2.5 scrollbar-sidebar">
          {sections.map((section, idx) => (
            <div key={section.title || `section-${idx}`} className="relative">
              {/* Section Header or Divider */}
              {collapsed ? (
                section.title && idx > 0 && <div className="my-1.5 mr-2.5 border-t border-white/10" />
              ) : (
                section.title && (
                  <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-teal-200/60 select-none">
                    {section.title}
                  </p>
                )
              )}

              {/* Items List */}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isRouteActive(item.to, item.end);

                  return (
                    <div key={item.to} className="relative group/item flex flex-col">
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={cn(
                          'relative flex items-center select-none transition-all duration-200',
                          collapsed
                            ? 'justify-center h-11 px-0 mr-2.5'
                            : 'min-h-[42px] py-2 px-3.5 gap-3 mr-0',
                          active
                            ? 'text-[#26444c] font-bold z-10'
                            : 'text-white/85 hover:text-white hover:bg-white/10 hover:translate-x-1.5 mr-3 rounded-xl z-0 text-[13px] font-medium'
                        )}
                      >
                        {/* SchoolsGhar Organic Curved Notch Active Indicator */}
                        {active && (
                          <motion.div
                            layoutId="activeNavOrganicNotch"
                            className={cn(
                              'absolute inset-y-0 left-1 -right-[1px] bg-[#edf3f6] z-10 pointer-events-none shadow-[-3px_0_10px_rgba(0,0,0,0.04)]',
                              collapsed ? 'rounded-l-xl' : 'rounded-l-full'
                            )}
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 32,
                              mass: 0.75,
                            }}
                          >
                            {/* Top Concave Curve Fillet */}
                            <svg
                              className="absolute -top-[37px] right-0 w-[38px] h-[38px] text-[#edf3f6] pointer-events-none"
                              viewBox="0 0 38 38"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M 38,0 L 38,38 L 0,38 C 21,38 38,21 38,0 Z" />
                            </svg>
                            {/* Bottom Concave Curve Fillet */}
                            <svg
                              className="absolute -bottom-[37px] right-0 w-[38px] h-[38px] text-[#edf3f6] pointer-events-none"
                              viewBox="0 0 38 38"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M 38,38 L 38,0 L 0,0 C 21,0 38,17 38,38 Z" />
                            </svg>
                          </motion.div>
                        )}

                        {/* Icon with smooth scale animation */}
                        <item.icon
                          className={cn(
                            'relative z-20 shrink-0 transition-transform duration-200',
                            active
                              ? 'h-[18px] w-[18px] text-[#26444c] font-bold scale-110'
                              : 'h-4 w-4 text-white/85 group-hover/item:text-white group-hover/item:scale-110'
                          )}
                        />

                        {/* Label & Badge (hidden in collapsed mode) */}
                        {!collapsed && (
                          <div className="flex items-center justify-between flex-1 min-w-0 pr-1 relative z-20">
                            <span
                              className={cn(
                                'tracking-tight leading-tight truncate transition-opacity duration-200',
                                active ? 'text-[13px] font-bold text-[#26444c]' : 'text-[13px] font-medium'
                              )}
                            >
                              {item.label}
                            </span>
                            {item.to === '/customers' && (
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                  active ? 'bg-[#26444c]/15 text-[#26444c]' : 'bg-white/20 text-teal-200'
                                )}
                              >
                                120
                              </span>
                            )}
                          </div>
                        )}

                        {/* Hover Tooltip when sidebar is collapsed */}
                        <NavTooltip label={item.label} visible={collapsed} />
                      </NavLink>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Area: Scheme Status & User Profile */}
        <div
          className={cn(
            'shrink-0 pb-3 transition-all duration-300',
            collapsed ? 'px-2 space-y-2' : 'px-3 space-y-2.5'
          )}
        >
          {/* Scheme Progress Widget (Replit style) */}
          {collapsed ? (
            <div
              className="flex justify-center p-2 rounded-xl bg-white/10 border border-white/10 text-center group/dot relative cursor-default"
              title="Month 15 of 28 · Mach & Quetta"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <NavTooltip label="Month 15 of 28 · Mach & Quetta" visible={true} />
            </div>
          ) : (
            <div className="rounded-xl bg-white/10 p-2.5 border border-white/10 text-left relative overflow-hidden group hover:bg-white/15 hover:border-white/20 transition-all duration-200 select-none">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-white tracking-wide flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Month 15 of 28
                </span>
                <span className="text-[10px] font-semibold text-teal-200/90">53.6%</span>
              </div>
              <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden mb-1">
                <div className="bg-gradient-to-r from-teal-400 to-emerald-400 h-full rounded-full w-[53.6%]" />
              </div>
              <p className="text-[10px] text-teal-200/80 font-medium">Mach · Quetta Scheme</p>
            </div>
          )}

          {/* User Info & Quick Sign-Out */}
          <div
            className={cn(
              'flex items-center pt-2 border-t border-white/10',
              collapsed ? 'justify-center' : 'justify-between px-0.5'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold ring-1 ring-white/20">
                {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="h-3.5 w-3.5" />}
              </div>
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-semibold text-white">
                    {user.name || 'Admin User'}
                  </p>
                  <p className="truncate text-[10px] text-teal-200/70 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 shrink-0 text-teal-300" />
                    <span className="truncate">{ROLE_LABELS[user.role] ?? titleCase(user.role)}</span>
                  </p>
                </div>
              )}
            </div>

            {!collapsed ? (
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10 rounded-md shrink-0 flex items-center justify-center transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            ) : (
              <NavTooltip
                label={`${user.name || 'Admin'} (${ROLE_LABELS[user.role] ?? user.role})`}
                visible={true}
              />
            )}
          </div>
        </div>
      </aside>

      {/* ================= MOBILE SLIDE DRAWER (SchoolsGhar Reference) ================= */}
      <AnimatePresence>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs lg:hidden flex animate-in fade-in duration-300"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-72 max-w-[85vw] bg-[#26444c] text-white p-4 flex flex-col h-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                    <LayoutGrid className="h-4.5 w-4.5 text-teal-300" />
                  </div>
                  <div>
                    <span className="font-bold text-lg text-white block leading-tight">
                      Chiltan
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-widest text-teal-200/70 block">
                      Enterprises
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User info capsule */}
              <div className="my-3 flex items-center gap-3 rounded-xl bg-black/20 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-sm ring-1 ring-white/20">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-[10px] text-teal-200/70 truncate">{user.email}</p>
                </div>
              </div>

              {/* Scrollable Mobile Nav Items */}
              <nav className="space-y-4 flex-1 min-h-0 overflow-y-auto scrollbar-sidebar pr-1">
                {sections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-teal-200/60">
                      {section.title}
                    </p>
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const active = isRouteActive(item.to, item.end);
                        return (
                          <li key={item.to}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl transition-all active:scale-98',
                                active
                                  ? 'bg-white text-[#26444c] shadow-sm font-bold'
                                  : 'text-white/85 hover:bg-white/10 hover:text-white'
                              )}
                            >
                              <item.icon
                                className={cn(
                                  'h-4.5 w-4.5 shrink-0',
                                  active ? 'text-[#26444c]' : 'text-white'
                                )}
                              />
                              <span className="truncate">{item.label}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>

              {/* Mobile Drawer Logout */}
              <div className="pt-3 border-t border-white/10 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 py-2.5 text-xs font-bold transition active:scale-98"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= MAIN CONTENT WRAPPER ================= */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[224px]'
        )}
      >
        {/* ================= TOP NAVBAR ================= */}
        <header className="sticky top-0 z-20 flex h-14 sm:h-16 w-full items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-3 sm:px-6 shadow-xs text-slate-800 no-print">
          {/* Left: Mobile hamburger + Mobile Brand Title / Desktop Current Page Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-700 lg:hidden transition"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle Navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Mobile Brand Name */}
            <div
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer select-none min-w-0 lg:hidden"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#26444c] text-teal-300">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900 truncate">
                Chiltan Enterprises
              </span>
            </div>

            {/* Desktop Current Page Breadcrumb / Title */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900">
                {getPageTitle()}
              </span>
              <span className="inline-block h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-xs font-medium text-slate-400">
                Motorcycle Showroom Management
              </span>
            </div>
          </div>

          {/* Right: Search Input + Bell + Admin User Capsule */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Top Search Pill */}
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search showroom..."
                value={topSearch}
                onChange={(e) => setTopSearch(e.target.value)}
                className="w-36 lg:w-56 rounded-full bg-slate-100 pl-4 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none border border-slate-200 focus:bg-white focus:ring-2 focus:ring-teal-500 transition"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>

            {/* Live Scheme Date Pill (Replit style) */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200/80 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-pulse" />
              <span>Oct 14, 2026</span>
            </div>

            {/* Bell Icon with Red Counter Badge */}
            <div
              className="relative cursor-pointer p-1.5 rounded-full hover:bg-slate-100 transition"
              title="Notifications"
            >
              <Bell className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-slate-600" />
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                1
              </span>
            </div>

            {/* User Profile Pill Capsule */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full sm:rounded-2xl bg-white p-1 sm:px-3 sm:py-1.5 text-slate-800 shadow-xs transition hover:shadow-sm border border-slate-200 outline-none active:scale-95"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#26444c] text-white text-xs font-bold ring-1 ring-white/20">
                    {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="h-4 w-4" />}
                  </div>
                  <div className="hidden sm:block text-left leading-tight max-w-[120px] lg:max-w-[160px]">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {user.name || 'Admin User'}
                    </p>
                    <p className="text-[10px] font-medium text-slate-500 truncate">
                      {user.email || 'admin@showroom.local'}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="font-semibold text-slate-900">{user.name || 'System User'}</p>
                  <p className="text-xs font-normal text-slate-500 truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(homePathFor(user.permissions))}>
                  <LayoutGrid className="mr-2 h-4 w-4" /> Go to dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <KeyRound className="mr-2 h-4 w-4" /> Profile & password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    navigate('/login', { replace: true });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-rose-500" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ================= MAIN ROUTE CONTENT ================= */}
        <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 pb-20 lg:pb-8 scrollbar-thin">
          <div key={location.pathname} className="space-y-4 sm:space-y-5 page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ================= MOBILE BOTTOM NAVIGATION BAR ================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-slate-200/80 bg-white/95 px-2 py-1 shadow-lg backdrop-blur-md lg:hidden select-none">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition active:scale-95',
              isActive ? 'text-[#26444c] font-bold' : 'text-slate-500 hover:text-slate-800'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  isActive && 'bg-teal-100/70 text-[#26444c]'
                )}
              >
                <LayoutGrid className="h-4.5 w-4.5" />
              </div>
              <span>Dashboard</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/customers"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition active:scale-95',
              isActive ? 'text-[#26444c] font-bold' : 'text-slate-500 hover:text-slate-800'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  isActive && 'bg-teal-100/70 text-[#26444c]'
                )}
              >
                <Users className="h-4.5 w-4.5" />
              </div>
              <span>Customers</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/tokens"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition active:scale-95',
              isActive ? 'text-[#26444c] font-bold' : 'text-slate-500 hover:text-slate-800'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  isActive && 'bg-teal-100/70 text-[#26444c]'
                )}
              >
                <Ticket className="h-4.5 w-4.5" />
              </div>
              <span>Tokens</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/payments"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition active:scale-95',
              isActive ? 'text-[#26444c] font-bold' : 'text-slate-500 hover:text-slate-800'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all',
                  isActive && 'bg-teal-100/70 text-[#26444c]'
                )}
              >
                <CreditCard className="h-4.5 w-4.5" />
              </div>
              <span>Payments</span>
            </>
          )}
        </NavLink>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold text-slate-500 transition active:scale-95 hover:text-slate-800"
        >
          <div className="flex h-7 w-12 items-center justify-center rounded-full">
            <Menu className="h-4.5 w-4.5" />
          </div>
          <span>Menu</span>
        </button>
      </nav>

      <React.Suspense fallback={null}>
        <Toaster position="top-right" richColors closeButton />
      </React.Suspense>
    </div>
  );
}
