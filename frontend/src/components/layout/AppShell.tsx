import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [topSearch, setTopSearch] = React.useState('');

  React.useEffect(() => setOpen(false), [location.pathname]);

  if (!user) return null;

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex h-screen w-screen max-h-screen flex-col overflow-hidden bg-[#edf3f6] text-slate-800 antialiased font-sans">
      {/* ================= TOP NAVBAR ================= */}
      <header className="shrink-0 z-40 flex h-14 sm:h-16 w-full items-center justify-between gap-2 sm:gap-4 bg-[#26444c] px-3 sm:px-6 shadow-md text-white no-print">
        {/* Left: Hamburger (mobile) + Grid Icon + "Chilton Enterprises" */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            className="p-1.5 -ml-1 rounded-lg hover:bg-white/10 active:bg-white/20 text-white lg:hidden transition"
            onClick={() => setOpen(!open)}
            aria-label="Toggle Navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer select-none min-w-0"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <LayoutGrid className="h-4.5 w-4.5 text-teal-300" />
            </div>
            <span className="text-base sm:text-xl font-bold tracking-tight text-white truncate">
              Chilton Enterprises
            </span>
          </div>
        </div>

        {/* Right: Search Input + Bell + Admin User Capsule */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Top Search Pill - visible on md screens */}
          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Search"
              value={topSearch}
              onChange={(e) => setTopSearch(e.target.value)}
              className="w-36 lg:w-56 rounded-full bg-white pl-4 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none shadow-inner focus:ring-2 focus:ring-sky-400"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Bell Icon with Red Counter Badge */}
          <div className="relative cursor-pointer p-1.5 rounded-full hover:bg-white/10 transition">
            <Bell className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white" />
            <span className="absolute 0 -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] font-bold text-white shadow-sm">
              1
            </span>
          </div>

          {/* User Profile Pill Capsule (compact avatar on mobile, full card on desktop) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full sm:rounded-2xl bg-white p-1 sm:px-3 sm:py-1.5 text-slate-800 shadow-sm transition hover:shadow border border-slate-100 outline-none active:scale-95"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold">
                  {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="h-4 w-4" />}
                </div>
                <div className="hidden sm:block text-left leading-tight max-w-[120px] lg:max-w-[160px]">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.name || 'Admin User'}</p>
                  <p className="text-[10px] font-medium text-slate-500 truncate">{user.email || 'admin@showroom.local'}</p>
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

      {/* ================= MAIN WRAPPER (SIDEBAR + CONTENT) ================= */}
      <div className="flex flex-1 min-h-0 overflow-hidden p-2 sm:p-4 gap-3 sm:gap-4">
        {/* Desktop Sidebar (Floating rounded dark slate-teal card) */}
        <aside
          className="hidden lg:flex w-56 xl:w-60 h-full min-h-0 flex-col shrink-0 rounded-2xl bg-[#26444c] p-4 text-white shadow-md select-none"
        >
          {/* Cursive Brand Logo at top */}
          <div className="shrink-0 py-2 pb-5 text-center">
            <span className="font-cursive text-2xl xl:text-3xl tracking-wide text-white drop-shadow-sm inline-block leading-tight">
              Chilton Enterprises
            </span>
          </div>

          {/* Navigation Links (Independent Scroll) */}
          <nav className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1 scrollbar-sidebar">
            {sections.map((section) => (
              <div key={section.title} className="space-y-1">
                {sections.length > 1 && (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-teal-200/60">
                    {section.title}
                  </p>
                )}
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150',
                            isActive
                              ? 'bg-white text-[#26444c] shadow-sm font-bold'
                              : 'text-white/85 hover:bg-white/10 hover:text-white'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[#26444c]' : 'text-white')} />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Role badge */}
          <div className="shrink-0 border-t border-white/10 pt-3 mt-auto">
            <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[11px] leading-tight text-teal-100">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{ROLE_LABELS[user.role] ?? titleCase(user.role)}</p>
                <p className="text-[10px] text-teal-200/70 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar Drawer */}
        {open && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs lg:hidden flex animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-72 max-w-[85vw] bg-[#26444c] text-white p-4 flex flex-col h-full shadow-2xl animate-in slide-in-from-left duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="font-cursive text-2xl text-white">Chilton Enterprises</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User info strip */}
              <div className="my-3 flex items-center gap-3 rounded-xl bg-black/20 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-bold text-sm">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-[10px] text-teal-200/70 truncate">{user.email}</p>
                </div>
              </div>

              <nav className="space-y-4 flex-1 min-h-0 overflow-y-auto scrollbar-sidebar pr-1">
                {sections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-teal-200/60">
                      {section.title}
                    </p>
                    <ul className="space-y-1">
                      {section.items.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all active:scale-98',
                                isActive
                                  ? 'bg-white text-[#26444c] shadow font-bold'
                                  : 'text-white/85 hover:bg-white/10 hover:text-white'
                              )
                            }
                          >
                            <item.icon className="h-4.5 w-4.5 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>

              {/* Mobile Logout Button */}
              <div className="pt-3 border-t border-white/10 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 py-2.5 text-xs font-bold transition active:scale-98"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area (Independent Scroll with bottom padding on mobile for bottom bar) */}
        <main className="flex-1 min-h-0 h-full overflow-y-auto px-1 sm:px-2 pb-20 lg:pb-8 scrollbar-thin">
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
              <div className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-all', isActive && 'bg-teal-100/70 text-[#26444c]')}>
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
              <div className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-all', isActive && 'bg-teal-100/70 text-[#26444c]')}>
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
              <div className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-all', isActive && 'bg-teal-100/70 text-[#26444c]')}>
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
              <div className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-all', isActive && 'bg-teal-100/70 text-[#26444c]')}>
                <CreditCard className="h-4.5 w-4.5" />
              </div>
              <span>Payments</span>
            </>
          )}
        </NavLink>

        <button
          type="button"
          onClick={() => setOpen(true)}
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
