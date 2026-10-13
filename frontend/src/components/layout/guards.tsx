import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from './nav';
import type { Permission } from '@/lib/permissions';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();

  if (!isReady && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Restoring your session…</p>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <Forbidden />;
  return <>{children}</>;
}

export function useRoutePermission(pathname: string): Permission | null {
  const segments = pathname.split('/').filter(Boolean);
  const base = `/${segments[0] ?? ''}`;
  return ROUTE_PERMISSIONS[base] ?? null;
}

export function Forbidden() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
      <ShieldAlert className="h-9 w-9 text-amber-600" />
      <h2 className="text-lg font-semibold">You do not have access to this area</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your role does not include this permission. Access is checked by the API on every request, so it cannot be
        granted from the browser. Ask an administrator if you believe this is a mistake.
      </p>
      <Button variant="outline" size="sm" onClick={() => window.history.back()}>
        Go back
      </Button>
    </div>
  );
}
