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
      {/* ================= TOP NAVBAR (Strictly matching reference image) ================= */}
      <header className="shrink-0 z-40 flex h-14 w-full items-center justify-between gap-4 bg-[#26444c] px-4 sm:px-6 shadow-md text-white no-print">
        {/* Left: Hamburger (mobile) + Grid Icon + "Showroom" */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle Navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <LayoutGrid className="h-5 w-5 text-white" />
            <span className="text-xl font-bold tracking-tight text-white">Chilton Enterprises</span>
          </div>
        </div>

        {/* Right: Search Input + Bell with Red Badge + Admin User Capsule */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Top Search Pill */}
          <div className="relative hidden sm:block">
            <input
              type="text"
              placeholder="Search"
              value={topSearch}
              onChange={(e) => setTopSearch(e.target.value)}
              className="w-40 sm:w-56 rounded-full bg-white pl-4 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none shadow-inner focus:ring-2 focus:ring-sky-400"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Bell Icon with Red Counter Badge */}
          <div className="relative cursor-pointer p-1 rounded-full hover:bg-white/10 transition">
            <Bell className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] font-bold text-white shadow-sm">
              1
            </span>
          </div>

          {/* User Profile Pill Capsule */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-1.5 text-slate-800 shadow-sm transition hover:shadow border border-slate-100 outline-none"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-bold text-slate-900">{user.name || 'Admin User'}</p>
                  <p className="text-[10px] font-medium text-slate-500">id: {user.email || 'admin@showroom.com'}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
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
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ================= MAIN WRAPPER (SIDEBAR + CONTENT) ================= */}
      <div className="flex flex-1 min-h-0 overflow-hidden p-3 sm:p-4 gap-4">
        {/* Desktop Sidebar (Floating rounded dark slate-teal card matching reference) */}
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
            className="fixed inset-0 z-50 bg-black/50 lg:hidden flex"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-64 bg-[#26444c] text-white p-5 flex flex-col h-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <span className="font-cursive text-2xl text-white">Chilton Enterprises</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto scrollbar-sidebar">
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
                                'flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg transition-all',
                                isActive
                                  ? 'bg-white text-[#26444c] shadow font-bold'
                                  : 'text-white/85 hover:bg-white/10 hover:text-white'
                              )
                            }
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main Content Area (Independent Scroll) */}
        <main className="flex-1 min-h-0 h-full overflow-y-auto pr-1 sm:pr-2 scrollbar-thin">
          <div key={location.pathname} className="space-y-5 page-enter pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      <React.Suspense fallback={null}>
        <Toaster position="top-right" richColors closeButton />
      </React.Suspense>
    </div>
  );
}
