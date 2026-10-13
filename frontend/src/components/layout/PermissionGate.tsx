import * as React from 'react';
import { useAuth } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';

/**
 * Hides UI the user cannot use. Purely cosmetic - the Express API enforces the same
 * permission and returns 403, so a hand-crafted request is still rejected.
 */
export function PermissionGate({
  requires,
  children,
  fallback = null,
}: {
  requires: Permission | Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useAuth();
  const list = Array.isArray(requires) ? requires : [requires];
  if (!can(...list)) return <>{fallback}</>;
  return <>{children}</>;
}
