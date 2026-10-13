import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/lib/notify';
import {
  ArrowLeft,
  Bike,
  CalendarClock,
  Download,
  FileText,
  HandCoins,
  Printer,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  Trophy,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Column, DataTable, Money } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge, MethodBadge } from '@/components/shared/StatusBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState, InlineAlert } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { PaymentDialog } from '@/components/shared/PaymentDialog';
import { Field } from '@/components/shared/Form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  exportCustomerStatement,
  useAdjustInstallment,
  useCustomer,
  useCustomerStatement,
  useReceipt,
  useReversePayment,
} from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { Installment, PaymentRow } from '@/lib/types';
import { downloadBlob, formatDate, formatDateTime, formatNumber, titleCase } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useCustomer(id);
  const statement = useCustomerStatement(id);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payMonths, setPayMonths] = React.useState<number[] | undefined>(undefined);
  const [receiptId, setReceiptId] = React.useState<string | null>(null);
  const [reversing, setReversing] = React.useState<PaymentRow | null>(null);
  const [adjusting, setAdjusting] = React.useState<Installment | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const reversePayment = useReversePayment();
  const adjust = useAdjustInstallment();
  const [adjustValue, setAdjustValue] = React.useState('');
  const [adjustReason, setAdjustReason] = React.useState('');

  const customer = detail.data?.customer as Record<string, unknown> | undefined;
  const enrollment = detail.data?.activeEnrollment as Record<string, unknown> | null | undefined;
  const installments = (statement.data?.installments ?? []) as Installment[];
  const payments = (statement.data?.payments ?? []) as Array<Record<string, unknown>>;
  const advances = (statement.data?.advances ?? []) as Array<Record<string, unknown>>;
  const draws = (statement.data?.draws ?? []) as Array<Record<string, unknown>>;
  const closures = (statement.data?.closures ?? []) as Array<Record<string, unknown>>;
  const audit = (statement.data?.auditTrail ?? []) as Array<Record<string, unknown>>;

  const paidCount = installments.filter((i) => i.status === 'paid').length;
  const payableCount = installments.filter((i) => i.status !== 'not_applicable').length;
  const stoppedFrom = installments.find((i) => i.stoppedAfterDraw)?.monthNumber ?? null;

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const doExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    setExporting(true);
    try {
      const { blob, filename } = await exportCustomerStatement(id, {}, format);
      downloadBlob(blob, filename ?? `statement.${format}`);
      toast.success('Statement downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const installmentColumns: Column<Installment>[] = [
    { header: 'Month', headerClassName: 'w-20', cell: (row) => <span className="font-mono">{String(row.monthNumber).padStart(2, '0')}</span> },
    { header: 'Due date', headerClassName: 'w-32', cell: (row) => formatDate(row.dueDate) },
    { header: 'Status', headerClassName: 'w-36', cell: (row) => (
      <span className="flex items-center gap-1.5">
        <StatusBadge value={row.status} />
        {row.stoppedAfterDraw && <Badge variant="muted">Stopped after draw</Badge>}
      </span>
    ) },
    { header: 'Scheduled', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.scheduledPaisa} /> },
    { header: 'Paid', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.paidPaisa} /> },
    { header: 'Adjusted', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => (row.adjustedPaisa ? <Money value={row.adjustedPaisa} /> : '-') },
    { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.outstandingPaisa} className="font-medium" /> },
    { header: '', headerClassName: 'w-24', cell: (row) => (
      <div className="flex justify-end">
        <PermissionGate requires={PERMISSIONS.PAYMENT_CREATE}>
          {['unpaid', 'partial', 'overdue'].includes(row.status) && (
            <Button size="sm" variant="outline" onClick={() => { setPayMonths([row.monthNumber]); setPayOpen(true); }}>
              <Wallet className="h-3.5 w-3.5" /> Pay
            </Button>
          )}
        </PermissionGate>
        <PermissionGate requires={PERMISSIONS.PAYMENT_REVERSE}>
          {['partial', 'overdue', 'unpaid'].includes(row.status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdjusting(row);
                setAdjustValue(String((Number(row.adjustedPaisa ?? 0) / 100).toFixed(2)));
                setAdjustReason('');
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          )}
        </PermissionGate>
      </div>
    ) },
  ];

  const paymentColumns: Column<Record<string, unknown>>[] = [
    { header: 'Payment no.', headerClassName: 'w-40', cell: (row) => (
      <span className="font-mono text-xs">{String(row.paymentNumber ?? '-')}</span>
    ) },
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(String(row.paymentDate)) },
    { header: 'Method', headerClassName: 'w-32', cell: (row) => <MethodBadge method={String(row.method)} /> },
    { header: 'Months', headerClassName: 'w-36', cell: (row) => {
      const allocations = (row.allocations as Array<{ monthNumber: number }>) ?? [];
      return allocations.length ? allocations.map((a) => a.monthNumber).join(', ') : 'Credit';
    } },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={Number(row.amountPaisa)} className="font-medium" /> },
    { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={String(row.status)} /> },
    { header: '', headerClassName: 'w-40', cell: (row) => (
      <div className="flex justify-end gap-1">
        {Boolean(row.receipt) && (
          <Button size="sm" variant="ghost" onClick={() => setReceiptId(String(row.receipt))}>
            <FileText className="h-3.5 w-3.5" /> Receipt
          </Button>
        )}
        <PermissionGate requires={PERMISSIONS.PAYMENT_REVERSE}>
          {row.status === 'posted' && (
            <Button size="sm" variant="outline" onClick={() => setReversing(row as unknown as PaymentRow)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </PermissionGate>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader
        title={String(customer?.name ?? 'Customer')}
        description={
          <>
            Token <span className="font-mono font-semibold">{String(enrollment?.tokenNumber ?? '').padStart(3, '0')}</span> ·{' '}
            {String(customer?.customerCode ?? '')} · {titleCase(String(customer?.location ?? ''))} · joined{' '}
            {formatDate(String(customer?.joiningDate ?? ''))}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-4 w-4" /> All customers
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('pdf')} disabled={exporting}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')} disabled={exporting}>
              <Download className="h-4 w-4" /> Excel
            </Button>
            <PermissionGate requires={PERMISSIONS.PAYMENT_CREATE}>
              <Button size="sm" onClick={() => { setPayMonths(undefined); setPayOpen(true); }} disabled={customer?.status !== 'active'}>
                <Wallet className="h-4 w-4" /> Record payment
              </Button>
            </PermissionGate>
          </>
        }
      />

      {stoppedFrom && (
        <InlineAlert tone="info" title="Draw confirmed — future installments stopped">
          Installments from month {stoppedFrom} onwards are marked <strong>Not applicable</strong> and are never counted as
          unpaid or overdue. All payments recorded before the draw are preserved.
        </InlineAlert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly installment" value={detail.isLoading ? <Skeleton className="h-7 w-24" /> : <Money value={Number(enrollment?.monthlyInstallmentPaisa ?? 0)} />} icon={<CalendarClock className="h-5 w-5" />} hint={`${formatNumber(Number(enrollment?.durationMonths ?? 28))}-month scheme`} />
        <StatCard label="Scheme total" value={<Money value={Number(enrollment?.schemeTotalPaisa ?? 0)} />} icon={<ScrollText className="h-5 w-5" />} hint="Monthly × 28" />
        <StatCard label="Total paid" tone="positive" value={<Money value={Number(enrollment?.totalPaidPaisa ?? 0)} />} icon={<Wallet className="h-5 w-5" />} hint={`${paidCount} of ${payableCount} payable months settled`} />
        <StatCard label="Outstanding" tone="negative" value={<Money value={Number(enrollment?.outstandingPaisa ?? 0)} />} icon={<HandCoins className="h-5 w-5" />} hint={customer?.status === 'drawn_closed' ? 'Closed after draw' : 'Payable balance'} />
      </div>

      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap">
          <TabsTrigger value="schedule">Installment schedule ({installments.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="advances">Advances ({advances.length})</TabsTrigger>
          <TabsTrigger value="draw">Draw &amp; closure ({draws.length})</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">28-month installment schedule</CardTitle>
              <CardDescription>
                Equal fixed instalments. Months after a confirmed draw are shown as Not applicable with zero outstanding.
              </CardDescription>
            </CardHeader>
            <DataTable
              columns={installmentColumns}
              rows={installments}
              rowKey={(row) => row._id}
              loading={statement.isLoading}
              error={statement.error}
              onRetry={() => void statement.refetch()}
              emptyMessage="No schedule generated yet."
              maxHeight="34rem"
              footer={
                <div className="flex flex-wrap items-center justify-end gap-6 border-t px-4 py-3 text-sm">
                  <span>Schedule total <Money value={installments.reduce((s, i) => s + i.scheduledPaisa, 0)} /></span>
                  <span>Paid <Money value={installments.reduce((s, i) => s + i.paidPaisa, 0)} /></span>
                  <span>Adjusted <Money value={installments.reduce((s, i) => s + i.adjustedPaisa, 0)} /></span>
                  <span className="font-semibold">Outstanding <Money value={installments.reduce((s, i) => s + i.outstandingPaisa, 0)} /></span>
                </div>
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment history</CardTitle>
              <CardDescription>Reversed payments stay visible with their reason — nothing is silently deleted.</CardDescription>
            </CardHeader>
            <DataTable
              columns={paymentColumns}
              rows={payments}
              rowKey={(row) => String(row._id)}
              loading={statement.isLoading}
              emptyMessage="No payments recorded yet."
              emptyHint={
                <PermissionGate requires={PERMISSIONS.PAYMENT_CREATE}>
                  <Button size="sm" onClick={() => { setPayMonths(undefined); setPayOpen(true); }}>
                    Record the first payment
                  </Button>
                </PermissionGate>
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="advances">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advance bike / advance cash</CardTitle>
              <CardDescription>An advance never stops the installment schedule.</CardDescription>
            </CardHeader>
            <DataTable
              columns={[
                { header: 'Type', cell: (row) => (
                  <span className="flex items-center gap-1.5">
                    {row.type === 'BIKE' ? <Bike className="h-4 w-4" /> : <HandCoins className="h-4 w-4" />}
                    {titleCase(String(row.type))}
                  </span>
                ) },
                { header: 'Date', cell: (row) => formatDate(String(row.advanceDate)) },
                { header: 'Details', cell: (row) => String(row.bikeModel ?? row.purpose ?? '-') },
                { header: 'Amount', className: 'text-right', cell: (row) => <Money value={Number(row.amountPaisa)} /> },
                { header: 'Status', cell: (row) => <StatusBadge value={String(row.status)} /> },
              ] as Column<Record<string, unknown>>[]}
              rows={advances}
              rowKey={(row) => String(row._id)}
              loading={statement.isLoading}
              emptyMessage="No advance recorded for this customer."
              emptyHint={<Button asChild size="sm" variant="outline"><Link to="/advances">Go to advances</Link></Button>}
            />
          </Card>
        </TabsContent>

        <TabsContent value="draw">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Draw result and closure</CardTitle>
              <CardDescription>Confirmed draws close the scheme and stop all later instalments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {draws.length === 0 && closures.length === 0 && (
                <p className="text-sm text-muted-foreground">This customer has not won a draw.</p>
              )}
              {draws.map((draw) => (
                <div key={String(draw._id)} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-600" />
                    <span className="font-medium">Scheme month {String(draw.schemeMonth)}</span>
                    <StatusBadge value={String(draw.status)} />
                    <span className="text-xs text-muted-foreground">{formatDate(String(draw.drawDate))}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Eligible pool {formatNumber(Number(draw.eligibleCount ?? 0))} customers · confirmed{' '}
                    {formatDateTime(String(draw.confirmedAt ?? ''))}
                    {draw.approvedByName ? ` · approved by ${String(draw.approvedByName)}` : ''}
                  </p>
                </div>
              ))}
              {closures.map((closure) => (
                <div key={String(closure._id)} className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Scheme closure</p>
                  <p className="text-xs text-muted-foreground">
                    Stopped from month {String(closure.stoppedFromMonth ?? '-')} · {String(closure.reason ?? '')} ·{' '}
                    {formatDateTime(String(closure.createdAt ?? ''))}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Customer details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Full name" value={String(customer?.name ?? '-')} />
                <Row label="Father / husband" value={String(customer?.fatherName ?? '-')} />
                <Row label="CNIC" value={<span className="font-mono">{String(customer?.cnic ?? '-')}</span>} />
                <Row label="Phone" value={String(customer?.phone ?? '-')} />
                <Row label="Location" value={titleCase(String(customer?.location ?? '-'))} />
                <Row label="Joining date" value={formatDate(String(customer?.joiningDate ?? ''))} />
                <Row label="Address" value={String(customer?.address ?? '-')} />
                <Row label="Notes" value={String(customer?.notes ?? '-')} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Enrollment</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Token" value={<span className="font-mono">{String(enrollment?.tokenNumber ?? '').padStart(3, '0')}</span>} />
                <Row label="Scheme" value={String(enrollment?.schemeCode ?? '-')} />
                <Row label="Duration" value={`${formatNumber(Number(enrollment?.durationMonths ?? 28))} months`} />
                <Row label="Monthly installment" value={<Money value={Number(enrollment?.monthlyInstallmentPaisa ?? 0)} />} />
                <Row label="Scheme total" value={<Money value={Number(enrollment?.schemeTotalPaisa ?? 0)} />} />
                <Row label="Status" value={<StatusBadge value={String(enrollment?.status ?? '-')} />} />
                <Row label="Draw status" value={<StatusBadge value={String(customer?.drawStatus ?? '-')} />} />
                <Row label="Enrolled on" value={formatDateTime(String(enrollment?.createdAt ?? ''))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit history</CardTitle>
              <CardDescription>Every change to this customer, their payments and their draw.</CardDescription>
            </CardHeader>
            <DataTable
              columns={[
                { header: 'When', headerClassName: 'w-40', cell: (row) => formatDateTime(String(row.createdAt)) },
                { header: 'Entity', headerClassName: 'w-28', cell: (row) => <Badge variant="outline">{String(row.entityType)}</Badge> },
                { header: 'Action', headerClassName: 'w-32', cell: (row) => <StatusBadge value={String(row.action)} /> },
                { header: 'By', headerClassName: 'w-40', cell: (row) => String(row.actorName ?? row.actorId ?? 'system') },
                { header: 'Summary', cell: (row) => String(row.summary ?? '-') },
              ] as Column<Record<string, unknown>>[]}
              rows={audit}
              rowKey={(row) => String(row._id)}
              loading={statement.isLoading}
              emptyMessage="No audit entries."
              maxHeight="32rem"
            />
          </Card>
        </TabsContent>
      </Tabs>

      <PaymentDialog
        open={payOpen}
        onOpenChange={(open) => { setPayOpen(open); setPayMonths(undefined); }}
        presetMonths={payMonths}
        target={{
          customerId: id,
          customerName: String(customer?.name ?? ''),
          tokenNumber: enrollment?.tokenNumber ? Number(enrollment.tokenNumber) : null,
          enrollmentId: enrollment?._id ? String(enrollment._id) : null,
          monthlyAmountPaisa: Number(enrollment?.monthlyInstallmentPaisa ?? 0),
        }}
      />

      <ReceiptDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />

      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse this payment"
        description="The original record is kept, a negative mirror entry is written and the balances are recalculated. Nothing is deleted."
        confirmLabel="Reverse payment"
        tone="destructive"
        requireReason
        reasonPlaceholder="e.g. wrong amount entered at counter"
        submitting={reversePayment.isPending}
        onConfirm={async (reason) => {
          if (!reversing || !reason) return;
          try {
            await reversePayment.mutateAsync({ id: String(reversing._id), reason });
            toast.success('Payment reversed and balances recalculated');
            setReversing(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />

      <Dialog open={Boolean(adjusting)} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust month {adjusting?.monthNumber}</DialogTitle>
            <DialogDescription>
              Waivers and concessions are recorded as adjustments with a reason. The installment history is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Adjusted amount (PKR)" hint="Set to the outstanding value to settle this month.">
              <Input type="number" step="0.01" min="0" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} />
            </Field>
            <Field label="Reason" required>
              <Textarea rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button
              disabled={adjust.isPending || adjustReason.trim().length < 5}
              onClick={async () => {
                if (!adjusting) return;
                try {
                  await adjust.mutateAsync({
                    installmentId: adjusting._id,
                    adjustedPkr: Number(adjustValue || 0),
                    reason: adjustReason.trim(),
                  });
                  toast.success('Installment adjusted');
                  setAdjusting(null);
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {adjust.isPending ? 'Saving…' : 'Apply adjustment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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

function ReceiptDialog({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const receipt = useReceipt(receiptId);
  const doc = receipt.data as Record<string, unknown> | undefined;
  const customerDoc = (doc?.customer ?? {}) as Record<string, unknown>;
  const allocations = (doc?.allocations ?? []) as Array<Record<string, unknown>>;
  return (
    <Dialog open={Boolean(receiptId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg print-area">
        <DialogHeader>
          <DialogTitle>Receipt {String(doc?.number ?? '')}</DialogTitle>
          <DialogDescription>Printed straight from the stored payment record.</DialogDescription>
        </DialogHeader>
        {receipt.isLoading && <p className="text-sm text-muted-foreground">Loading receipt…</p>}
        {receipt.isError && <ErrorState error={receipt.error} />}
        {doc && (
          <div className="space-y-2 rounded-md border p-4 text-sm">
            <Row label="Receipt number" value={<span className="font-mono">{String(doc.number)}</span>} />
            <Row label="Customer" value={`${String(doc.customerName ?? customerDoc.name ?? '-')} (${String(customerDoc.customerCode ?? '')})`} />
            <Row label="CNIC" value={<span className="font-mono">{String(customerDoc.cnic ?? '-')}</span>} />
            <Row label="Location" value={titleCase(String(customerDoc.location ?? '-'))} />
            <Row label="Issued" value={formatDateTime(String(doc.issuedAt ?? ''))} />
            <Row label="Method" value={titleCase(String(doc.method ?? '').replace(/_/g, ' '))} />
            <Row label="Token" value={<span className="font-mono">{String(doc.tokenNumber ?? '').padStart(3, '0')}</span>} />
            <Row label="Issued by" value={String(doc.issuedByName ?? '-')} />
            <Row label="Status" value={<StatusBadge value={String(doc.status ?? 'issued')} />} />
            {allocations.map((allocation) => (
              <Row
                key={String(allocation._id ?? allocation.monthNumber)}
                label={`Month ${String(allocation.monthNumber)}`}
                value={<Money value={Number(allocation.amountPaisa)} />}
              />
            ))}
            <Row label="Total received" value={<Money value={Number(doc.amountPaisa ?? 0)} />} />
            {doc.detail ? <Row label="Detail" value={String(doc.detail)} /> : null}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
