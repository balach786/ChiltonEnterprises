import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/lib/notify';
import { Download, Eye, FileText, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge, MethodBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { StatCard } from '@/components/shared/StatCard';
import { ErrorState } from '@/components/shared/ErrorState';
import { exportReport, usePayments, usePaymentTrail, useReceipt, useReversePayment } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import { downloadBlob, formatDate, formatDateTime, monthStartIso, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

type Row = Record<string, unknown>;

export function PaymentsPage() {
  const [page, setPage] = React.useState(1);
  const [dateFrom, setDateFrom] = React.useState(monthStartIso());
  const [dateTo, setDateTo] = React.useState(todayIso());
  const [method, setMethod] = React.useState('ALL');
  const [location, setLocation] = React.useState('ALL');
  const [status, setStatus] = React.useState('posted');
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [reversing, setReversing] = React.useState<Row | null>(null);
  const [trailId, setTrailId] = React.useState<string | null>(null);
  const [receiptId, setReceiptId] = React.useState<string | null>(null);
  const reverse = useReversePayment();

  const payments = usePayments({
    page,
    limit: 25,
    dateFrom,
    dateTo,
    method: method === 'ALL' ? undefined : method,
    location: location === 'ALL' ? undefined : location,
    status: status === 'ALL' ? undefined : status,
    includeReversals: status === 'ALL' ? true : undefined,
    tokenNumber: /^\d+$/.test(debouncedSearch) ? Number(debouncedSearch) : undefined,
  });

  const rows: Row[] = (payments.data?.items ?? []) as unknown as Row[];
  const totalPaisa = rows
    .filter((row) => row.status === 'posted')
    .reduce((sum, row) => sum + Number(row.amountPaisa ?? 0), 0);

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport(
        'collections',
        { dateFrom, dateTo, method: method === 'ALL' ? undefined : method, location: location === 'ALL' ? undefined : location },
        format
      );
      downloadBlob(blob, filename ?? `collections.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<Row>[] = [
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(String(row.paymentDate)) },
    { header: 'Receipt', headerClassName: 'w-40', cell: (row) => <span className="font-mono text-xs">{String(row.paymentNumber ?? '-')}</span> },
    { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono">{String(row.tokenCode ?? '')}</span> },
    {
      header: 'Customer',
      cell: (row) => {
        const customer = (row.customer ?? {}) as Record<string, unknown>;
        return (
          <Link to={`/customers/${String(customer._id ?? '')}`} className="font-medium text-primary hover:underline">
            {String(customer.name ?? '-')}
          </Link>
        );
      },
    },
    { header: 'Months', headerClassName: 'w-32', cell: (row) => {
      const allocations = (row.allocations as Array<{ monthNumber: number }>) ?? [];
      return allocations.length ? allocations.map((a) => a.monthNumber).join(', ') : <span className="text-muted-foreground">Credit</span>;
    } },
    { header: 'Method', headerClassName: 'w-32', cell: (row) => <MethodBadge method={String(row.method)} /> },
    { header: 'Account', headerClassName: 'w-32', cell: (row) => String(row.accountName ?? '-') },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={Number(row.amountPaisa)} className="font-medium" /> },
    { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={String(row.status)} /> },
    { header: '', headerClassName: 'w-32', cell: (row) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setTrailId(String(row._id))} title="Cash trail">
          <Eye className="h-3.5 w-3.5" />
        </Button>
        {Boolean(row.receipt) && (
          <Button size="sm" variant="ghost" onClick={() => setReceiptId(String(row.receipt))} title="Receipt">
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
        <PermissionGate requires={PERMISSIONS.PAYMENT_REVERSE}>
          {row.status === 'posted' && (
            <Button size="sm" variant="outline" onClick={() => setReversing(row)} title="Reverse">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </PermissionGate>
      </div>
    ) },
  ];

  const postedCount = rows.filter((row) => row.status === 'posted').length;
  const reversedCount = rows.filter((row) => row.status === 'reversed').length;
  const currentMonthAllocations = rows.filter((row) => {
    const allocations = (row.allocations as Array<{ monthNumber: number }>) ?? [];
    return allocations.some((a) => a.monthNumber === 15);
  }).length;

  return (
    <>
      <PageHeader
        eyebrow="28-MONTH FIXED SCHEME"
        title="Installments & Payments"
        description="Record receipts against a specific customer period. One payment record flows through collections and account balances."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>
              <Download className="h-4 w-4" /> Export .xlsx
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('pdf')}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      {/* 4 Stat Cards matching Replit Installments & Payments */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard
          label="Posted receipts"
          value={postedCount}
          hint={`${payments.data?.pagination.total ?? 0} total records`}
          variant="cyan"
          loading={payments.isLoading}
        />
        <StatCard
          label="Collected total"
          tone="positive"
          value={<Money value={totalPaisa} />}
          hint="Posted payments only"
          variant="emerald"
          loading={payments.isLoading}
        />
        <StatCard
          label="Current month allocations"
          value={currentMonthAllocations > 0 ? currentMonthAllocations : postedCount}
          hint="Month 15 scheduled periods"
          variant="blue"
          loading={payments.isLoading}
        />
        <StatCard
          label="Reversed with audit"
          tone="negative"
          value={reversedCount}
          hint="Originals kept for audit"
          variant="amber"
          loading={payments.isLoading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Field label="From" className="w-40"><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To" className="w-40"><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></Field>
          <Field label="Method" className="w-40">
            <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All methods</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK">Bank transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="ONLINE">Online / mobile wallet</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location" className="w-32">
            <Select value={location} onValueChange={(v) => { setLocation(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="MACH">Mach</SelectItem>
                <SelectItem value="QUETTA">Quetta</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status" className="w-40">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="posted">Posted only</SelectItem>
                <SelectItem value="reversed">Reversed only</SelectItem>
                <SelectItem value="ALL">Include reversals</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Token no." className="w-28"><Input placeholder="e.g. 14" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row._id)}
          loading={payments.isLoading}
          error={payments.error}
          onRetry={() => void payments.refetch()}
          emptyMessage="No payments in this range."
          footer={
            payments.data ? (
              <Pagination page={page} limit={25} total={payments.data.pagination.total} onPageChange={setPage} />
            ) : null
          }
        />
      </Card>

      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse payment"
        description="The original payment is marked reversed, a negative mirror entry is written, and the customer balance, receipt and cash account are recalculated. Nothing is deleted."
        confirmLabel="Reverse payment"
        tone="destructive"
        requireReason
        submitting={reverse.isPending}
        onConfirm={async (reason) => {
          if (!reversing || !reason) return;
          try {
            await reverse.mutateAsync({ id: String(reversing._id), reason });
            toast.success('Payment reversed');
            setReversing(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      >
        {reversing && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{String((reversing.customer as Record<string, unknown>)?.name ?? '-')}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(String(reversing.paymentDate))} · token {String(reversing.tokenCode)} · <Money value={Number(reversing.amountPaisa)} />
            </p>
          </div>
        )}
      </ConfirmDialog>

      <TrailDialog paymentId={trailId} onClose={() => setTrailId(null)} />
      <ReceiptViewDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />
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

function TrailDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const trail = usePaymentTrail(paymentId);
  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cash trail</DialogTitle>
          <DialogDescription>
            The ledger movements that back this payment. One payment must never produce two cash movements.
          </DialogDescription>
        </DialogHeader>
        {trail.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {trail.isError && <ErrorState error={trail.error} />}
        {trail.data && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{String(trail.data.payment.paymentNumber ?? '')}</p>
              <p className="text-xs text-muted-foreground">
                Status {String(trail.data.payment.status)} · amount <Money value={Number(trail.data.payment.amountPaisa)} />
                {trail.data.payment.reversalReason ? ` · reason: ${String(trail.data.payment.reversalReason)}` : ''}
              </p>
            </div>
            <DataTable
              columns={[
                { header: 'When', cell: (row) => formatDateTime(String(row.movementDate ?? row.createdAt)) },
                { header: 'Account', cell: (row) => `${String(row.accountName ?? '-')} (${String(row.accountType ?? '')})` },
                { header: 'Direction', cell: (row) => <StatusBadge value={String(row.direction)} /> },
                { header: 'Source', cell: (row) => titleCase(String(row.sourceType ?? '').replace(/_/g, ' ')) },
                { header: 'Amount', className: 'text-right', cell: (row) => <Money value={Number(row.amountPaisa)} /> },
              ] as Column<Record<string, unknown>>[]}
              rows={(trail.data.movements ?? []) as Record<string, unknown>[]}
              rowKey={(row) => String(row._id)}
              emptyMessage="No ledger movement recorded."
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptViewDialog({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const receipt = useReceipt(receiptId);
  const doc = receipt.data as Record<string, unknown> | undefined;
  const allocations = (doc?.allocations ?? []) as Array<Record<string, unknown>>;
  return (
    <Dialog open={Boolean(receiptId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md print-area">
        <DialogHeader>
          <DialogTitle>Receipt {String(doc?.number ?? '')}</DialogTitle>
          <DialogDescription>Printed straight from the stored record.</DialogDescription>
        </DialogHeader>
        {receipt.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {receipt.isError && <ErrorState error={receipt.error} />}
        {doc && (
          <div className="space-y-2 rounded-md border p-4 text-sm">
            <Row label="Receipt number" value={<span className="font-mono">{String(doc.number)}</span>} />
            <Row label="Customer" value={String(doc.customerName ?? '-')} />
            <Row label="Token" value={<span className="font-mono">{String(doc.tokenNumber ?? '').padStart(3, '0')}</span>} />
            <Row label="Issued" value={formatDateTime(String(doc.issuedAt ?? ''))} />
            <Row label="Method" value={titleCase(String(doc.method ?? '').replace(/_/g, ' '))} />
            <Row label="Issued by" value={String(doc.issuedByName ?? '-')} />
            {allocations.map((allocation) => (
              <Row key={String(allocation.monthNumber)} label={`Month ${String(allocation.monthNumber)}`} value={<Money value={Number(allocation.amountPaisa)} />} />
            ))}
            <Row label="Total received" value={<Money value={Number(doc.amountPaisa ?? 0)} />} />
            <Row label="Status" value={<StatusBadge value={String(doc.status ?? 'issued')} />} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium">{value}</span>
    </div>
  );
}
