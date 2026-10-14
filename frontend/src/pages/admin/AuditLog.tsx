import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Column, DataTable, Pagination } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuditLogs } from '@/hooks/useApi';
import type { AuditLogRow } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/utils';

export function AuditLogPage() {
  const [page, setPage] = React.useState(1);
  const [entityType, setEntityType] = React.useState('ALL');
  const [action, setAction] = React.useState('ALL');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [detail, setDetail] = React.useState<AuditLogRow | null>(null);

  const logs = useAuditLogs({
    page,
    limit: 30,
    entityType: entityType === 'ALL' ? undefined : entityType,
    action: action === 'ALL' ? undefined : action,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const rows: AuditLogRow[] = logs.data?.items ?? [];

  const columns: Column<AuditLogRow>[] = [
    { header: 'When', headerClassName: 'w-44', cell: (row) => formatDateTime(row.createdAt) },
    { header: 'Entity', headerClassName: 'w-32', cell: (row) => <Badge variant="outline">{titleCase(row.entityType)}</Badge> },
    { header: 'Action', headerClassName: 'w-36', cell: (row) => <Badge variant="secondary">{titleCase(row.action.replace(/_/g, ' '))}</Badge> },
    { header: 'By', headerClassName: 'w-40', cell: (row) => String(row.actorName ?? row.actor ?? 'system') },
    { header: 'Description', cell: (row) => String(row.description ?? '-') },
    {
      header: '',
      headerClassName: 'w-20',
      cell: (row) => (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setDetail(row)}>
            Detail
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CHANGE HISTORY · DEMO USER"
        title="Audit Log"
        description="Important financial and customer actions are retained in the current in-memory session."
        actions={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Field label="Entity" className="w-40">
            <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All entities</SelectItem>
                {['Customer', 'Payment', 'Installment', 'DrawEvent', 'CustomerAdvance', 'ExpenseTransaction', 'IncomeTransaction', 'PartnerTransaction', 'Transfer', 'Reconciliation', 'User', 'Settings', 'Token', 'Report'].map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Action" className="w-40">
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {['CREATE', 'UPDATE', 'REVERSAL', 'CORRECTION', 'CONFIRM', 'EXPORT', 'LOGIN', 'DELETE'].map((item) => (
                  <SelectItem key={item} value={item}>{titleCase(item)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="From" className="w-40"><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To" className="w-40"><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></Field>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={logs.isLoading}
          error={logs.error}
          onRetry={() => void logs.refetch()}
          emptyMessage="No audit entries match these filters."
          maxHeight="34rem"
          footer={logs.data ? <Pagination page={page} limit={30} total={logs.data.pagination.total} onPageChange={setPage} /> : null}
        />
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{titleCase(detail?.action.replace(/_/g, ' ') ?? '')}</DialogTitle>
            <DialogDescription>
              {titleCase(detail?.entityType ?? '')} · {formatDateTime(detail?.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="Description" value={detail?.description ?? '-'} />
            <Row label="Actor" value={`${detail?.actorName ?? 'system'}${detail?.actorRole ? ` (${detail.actorRole})` : ''}`} />
            {detail?.reason ? <Row label="Reason" value={String(detail.reason)} /> : null}
            {detail?.ipAddress ? <Row label="IP" value={String(detail.ipAddress)} /> : null}
            <Row label="Entity id" value={<span className="font-mono text-xs">{detail?.entityId ?? '-'}</span>} />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Changes</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-xs scrollbar-thin">
                {detail?.previousValue || detail?.newValue
                  ? JSON.stringify({ previous: detail?.previousValue ?? null, updated: detail?.newValue ?? null }, null, 2)
                  : 'No change payload stored for this entry.'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right font-medium">{value}</span>
    </div>
  );
}
