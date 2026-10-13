import * as React from 'react';
import { Link } from 'react-router-dom';
import { Search, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/shared/StatCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useInitTokens, useTokens } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PERMISSIONS } from '@/lib/permissions';
import type { TokenRow } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { errorMessage } from '@/lib/api';

export function TokensPage() {
  const [status, setStatus] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  // 120 tiles re-render on every keystroke otherwise; debounce keeps typing smooth.
  const debouncedSearch = useDebouncedValue(search);
  const tokens = useTokens({ status: status === 'ALL' ? undefined : status, search: debouncedSearch || undefined });
  const initTokens = useInitTokens();

  const items: TokenRow[] = tokens.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Token register"
        description="Exactly 120 tokens (001–120). A token is never deleted — releasing it keeps its assignment history."
        actions={
          <PermissionGate requires={PERMISSIONS.SETTINGS_UPDATE}>
            <Button
              variant="outline"
              size="sm"
              disabled={initTokens.isPending}
              onClick={async () => {
                try {
                  const result = await initTokens.mutateAsync();
                  toast.success(`Token register checked · ${result.total} slots present`);
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              <Ticket className="h-4 w-4" /> {initTokens.isPending ? 'Checking…' : 'Ensure 120 tokens'}
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total tokens" value={formatNumber(tokens.data?.total ?? 0)} hint="Fixed at 120 by the scheme" icon={<Ticket className="h-5 w-5" />} loading={tokens.isLoading} />
        <StatCard label="Assigned" tone="info" value={formatNumber(tokens.data?.assigned ?? 0)} hint="Currently enrolled" loading={tokens.isLoading} />
        <StatCard label="Unassigned" tone="positive" value={formatNumber(tokens.data?.unassigned ?? 0)} hint="Available for new customers" loading={tokens.isLoading} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Register</CardTitle>
            <CardDescription>Green tiles are free; blue tiles belong to an enrolled customer.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-44 pl-8"
                placeholder="Token or customer"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tokens</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {tokens.isError ? (
            <ErrorState error={tokens.error} onRetry={() => void tokens.refetch()} />
          ) : tokens.isLoading ? (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
              {Array.from({ length: 40 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tokens match this filter.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
              {items.map((token) => {
                const assignment = token.currentAssignment;
                const name = assignment?.customerName;
                const assigned = token.status === 'assigned';
                const inner = (
                  <div
                    className={cn(
                      'flex h-full flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors',
                      assigned ? 'border-sky-300 bg-sky-50 hover:bg-sky-100' : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                    )}
                  >
                    <span className="font-mono text-sm font-semibold">{token.code}</span>
                    <span className={cn('line-clamp-2 text-[10px] leading-tight', assigned ? 'text-sky-800' : 'text-emerald-800')}>
                      {assigned ? name ?? 'Assigned' : 'Available'}
                    </span>
                  </div>
                );
                return assignment ? (
                  <Link key={token._id} to={`/customers/${assignment.customerId}`} className="block h-16">
                    {inner}
                  </Link>
                ) : (
                  <div key={token._id} className="h-16">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="info">Assigned</Badge>
            <span>belongs to an enrolled customer</span>
            <Badge variant="success">Unassigned</Badge>
            <span>available for a new enrolment</span>
            <span className="ml-auto">{items.length} shown</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
