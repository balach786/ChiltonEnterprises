import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/lib/notify';
import { Bike, Download, HandCoins, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { Textarea } from '@/components/ui/textarea';
import { exportReport, useAccounts, useAdvances, useCreateAdvance, useCustomers } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { AdvanceRow } from '@/lib/types';
import { downloadBlob, formatDate, formatNumber, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

const PAGE_SIZE = 25;

export function AdvancesPage() {
  const [params] = useSearchParams();
  const [type, setType] = React.useState(params.get('type') ?? 'ALL');
  const [status, setStatus] = React.useState('ALL');
  const [location, setLocation] = React.useState('ALL');
  const [onlyStillPaying, setOnlyStillPaying] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const advances = useAdvances({
    type: type === 'ALL' ? undefined : type,
    status: status === 'ALL' ? undefined : status,
    location: location === 'ALL' ? undefined : location,
    onlyStillPaying: onlyStillPaying === 'YES' ? true : undefined,
    search: debouncedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  });

  // Any filter change restarts at page 1.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, status, location, onlyStillPaying]);

  const rows: AdvanceRow[] = advances.data?.items ?? [];
  const totals = advances.data?.totals;
  const pagination = advances.data?.pagination;

  const doExport = async (format: 'xlsx' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport('advances', { type: type === 'ALL' ? undefined : type }, format);
      downloadBlob(blob, filename ?? `advances.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<AdvanceRow>[] = [
    { header: 'Ref', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.advanceCode}</span> },
    { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{row.tokenCode}</span> },
    { header: 'Customer', cell: (row) => (
      <div className="min-w-0">
        <p className="font-medium">{row.customerName}</p>
        <p className="text-xs text-muted-foreground">{titleCase(row.location)}</p>
      </div>
    ) },
    {
      header: 'Type',
      headerClassName: 'w-32',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {row.type === 'BIKE' ? <Bike className="h-4 w-4 text-sky-700" /> : <HandCoins className="h-4 w-4 text-amber-700" />}
          {row.type === 'BIKE' ? 'Advance bike' : 'Advance cash'}
        </span>
      ),
    },
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.advanceDate) },
    { header: 'Details', cell: (row) => (
      <div className="min-w-0 text-xs">
        <p className="truncate">{row.bikeModel ?? row.purpose ?? '-'}</p>
        {row.chassisNumber && <p className="text-muted-foreground">Chassis {row.chassisNumber}</p>}
      </div>
    ) },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} className="font-medium" /> },
    {
      header: 'Installments',
      headerClassName: 'w-36',
      cell: (row) =>
        row.installmentsContinue ? (
          <Badge variant="success">Continue</Badge>
        ) : (
          <Badge variant="destructive">Stopped</Badge>
        ),
    },
    { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="SEPARATE CUSTOMER ARRANGEMENTS"
        title="Advance Bike / Cash"
        description="Advances are distinct from the draw. Active customers continue paying installments unless later drawn and closed."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <PermissionGate requires={PERMISSIONS.ADVANCE_CREATE}>
              <Button size="sm" onClick={() => setOpen(true)} className="bg-teal-700 hover:bg-teal-800 text-white shadow-xs">
                <Plus className="h-4 w-4" /> Issue advance
              </Button>
            </PermissionGate>
          </>
        }
      />

      <InlineAlert tone="info" title="Advance does not close account">
        Advances are distinct from the draw. Active customers continue paying monthly installments unless later drawn and closed in Qurandazi.
      </InlineAlert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 my-4">
        <StatCard
          label="Bike cases"
          value={formatNumber(totals?.bikeCount ?? 0)}
          hint={`${formatNumber(totals?.count ?? 0)} advances total`}
          icon={<Bike className="h-5 w-5" />}
          variant="cyan"
          loading={advances.isLoading}
        />
        <StatCard
          label="Cash cases"
          value={formatNumber(totals?.cashCount ?? 0)}
          hint="Direct cash advance records"
          icon={<HandCoins className="h-5 w-5" />}
          variant="amber"
          loading={advances.isLoading}
        />
        <StatCard
          label="Advance cash issued"
          value={<Money value={totals?.totalPaisa ?? 0} />}
          hint="Distinct from operating expenses"
          variant="emerald"
          tone="positive"
          loading={advances.isLoading}
        />
        <StatCard
          label="Still paying"
          tone="positive"
          value={formatNumber(totals?.stillPayingCount ?? 0)}
          hint="Installments remain active"
          variant="blue"
          loading={advances.isLoading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Filter label="Type" className="w-40">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Both types</SelectItem>
                <SelectItem value="BIKE">Advance bike</SelectItem>
                <SelectItem value="CASH">Advance cash</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Status" className="w-36">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SETTLED">Settled</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Location" className="w-32">
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="MACH">Mach</SelectItem>
                <SelectItem value="QUETTA">Quetta</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Still paying" className="w-36">
            <Select value={onlyStillPaying} onValueChange={setOnlyStillPaying}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Everyone</SelectItem>
                <SelectItem value="YES">Active customers</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Search" className="w-52">
            <Input placeholder="Name, token or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Filter>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={advances.isLoading}
          error={advances.error}
          onRetry={() => void advances.refetch()}
          emptyMessage="No advances recorded."
          footer={
            pagination ? (
              <Pagination page={pagination.page} limit={pagination.limit} total={pagination.total} onPageChange={setPage} />
            ) : null
          }
        />
      </Card>

      <AdvanceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function Filter({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function AdvanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [type, setType] = React.useState<'BIKE' | 'CASH'>('BIKE');
  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customerId, setCustomerId] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [amount, setAmount] = React.useState('');
  const [bikeModel, setBikeModel] = React.useState('');
  const [chassis, setChassis] = React.useState('');
  const [engine, setEngine] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [authorizedBy, setAuthorizedBy] = React.useState('');
  const [approver, setApprover] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  const accounts = useAccounts();
  const createAdvance = useCreateAdvance();
  const customers = useCustomers({ search: customerQuery, limit: 25, status: 'active' });

  React.useEffect(() => {
    if (open) {
      setType('BIKE');
      setCustomerQuery('');
      setCustomerId('');
      setDate(todayIso());
      setAmount('');
      setBikeModel('');
      setChassis('');
      setEngine('');
      setPurpose('');
      setAuthorizedBy('');
      setApprover('');
      setNotes('');
      setFailure(null);
    }
  }, [open]);

  const selected = customers.data?.items.find((c) => c._id === customerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record an advance</DialogTitle>
          <DialogDescription>
            Advance bike takes a motorcycle early; advance cash releases money early. Both keep the installment schedule
            running.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Advance type" required className="sm:col-span-2">
            <Select value={type} onValueChange={(v) => setType(v as 'BIKE' | 'CASH')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BIKE">Advance bike — motorcycle handed over early</SelectItem>
                <SelectItem value="CASH">Advance cash — cash released early</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Customer" required hint="Type a name, phone, CNIC or token number." className="sm:col-span-2">
            <Input placeholder="Search active customers" value={customerQuery} onChange={(e) => { setCustomerQuery(e.target.value); setCustomerId(''); }} />
          </Field>

          {(customers.data?.items.length ?? 0) > 0 && !selected && (
            <div className="max-h-40 overflow-y-auto rounded-md border scrollbar-thin sm:col-span-2">
              {customers.data?.items.map((customer) => (
                <button
                  key={customer._id}
                  type="button"
                  onClick={() => setCustomerId(customer._id)}
                  className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60"
                >
                  <span>
                    <span className="font-medium">{customer.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      token {String(customer.tokenNumber ?? '').padStart(3, '0')} · {titleCase(customer.location)}
                    </span>
                  </span>
                  <Money value={customer.outstandingPaisa} />
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm sm:col-span-2">
              <p className="font-medium">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                Token {String(selected.tokenNumber ?? '').padStart(3, '0')} · outstanding{' '}
                <Money value={selected.outstandingPaisa} /> · monthly <Money value={selected.monthlyInstallmentPaisa} />
              </p>
            </div>
          )}

          <Field label="Advance date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {type === 'CASH' ? (
            <Field label="Amount (PKR)" required>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="Bike model"><Input value={bikeModel} onChange={(e) => setBikeModel(e.target.value)} /></Field>
              <Field label="Chassis number"><Input value={chassis} onChange={(e) => setChassis(e.target.value)} /></Field>
              <Field label="Engine number"><Input value={engine} onChange={(e) => setEngine(e.target.value)} /></Field>
            </>
          )}
          <Field label="Purpose" className="sm:col-span-2">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          <Field label="Authorized by"><Input value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} /></Field>
          <Field label="Approver"><Input value={approver} onChange={(e) => setApprover(e.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        {type === 'CASH' && (
          <InlineAlert tone="warning" title="One cash outflow only">
            Saving creates a single expense record and a single OUT movement from{' '}
            {accounts.data?.find((a) => a.type === 'CASH')?.name ?? 'the cash account'}. A second attempt for the same
            advance is rejected.
          </InlineAlert>
        )}

        <FormError message={failure ?? undefined} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createAdvance.isPending}>Cancel</Button>
          <Button
            disabled={createAdvance.isPending || !customerId || (type === 'CASH' && !amount)}
            onClick={async () => {
              setFailure(null);
              try {
                await createAdvance.mutateAsync({
                  customerId,
                  type,
                  advanceDate: date,
                  amountPkr: type === 'CASH' ? Number(amount) : 0,
                  bikeModel: bikeModel || undefined,
                  chassisNumber: chassis || undefined,
                  engineNumber: engine || undefined,
                  purpose: purpose || undefined,
                  authorizedBy: authorizedBy || undefined,
                  approver: approver || undefined,
                  notes: notes || undefined,
                });
                toast.success(type === 'BIKE' ? 'Advance bike recorded — installments continue' : 'Advance cash recorded — one outflow created');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {createAdvance.isPending ? 'Saving…' : 'Save advance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
