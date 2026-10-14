import * as React from 'react';
import { toast } from '@/lib/notify';
import { ArrowLeftRight, Banknote, Download, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { Textarea } from '@/components/ui/textarea';
import { MethodSelect } from '../Income';
import {
  exportReport,
  useAccounts,
  useCashMovements,
  useCreateAccount,
  useCreateReconciliation,
  useCreateTransfer,
  useReconciliations,
  useTransfers,
} from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { AccountRow, CashMovementRow, ReconciliationRow, TransferRow } from '@/lib/types';
import { downloadBlob, formatDate, formatDateTime, monthStartIso, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function CashBankPage() {
  const accounts = useAccounts();
  const [page, setPage] = React.useState(1);
  const [dateFrom, setDateFrom] = React.useState(monthStartIso());
  const [dateTo, setDateTo] = React.useState(todayIso());
  const [accountFilter, setAccountFilter] = React.useState('ALL');
  const [direction, setDirection] = React.useState('ALL');
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [reconOpen, setReconOpen] = React.useState(false);

  const movements = useCashMovements({
    page,
    limit: 25,
    dateFrom,
    dateTo,
    accountId: accountFilter === 'ALL' ? undefined : accountFilter,
    direction: direction === 'ALL' ? undefined : direction,
  });
  const transfers = useTransfers();
  const reconciliations = useReconciliations();

  const rows: CashMovementRow[] = movements.data?.items ?? [];
  const cashAccounts = (accounts.data ?? []).filter((a) => a.type === 'CASH');
  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === 'BANK');
  const cashBalance = cashAccounts.reduce((sum, a) => sum + Number(a.balancePaisa ?? 0), 0);
  const bankBalance = bankAccounts.reduce((sum, a) => sum + Number(a.balancePaisa ?? 0), 0);

  const doExport = async (format: 'xlsx' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport('cash-bank', { dateFrom, dateTo }, format);
      downloadBlob(blob, filename ?? `cash-bank.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const movementColumns: Column<CashMovementRow>[] = [
    { header: 'Date', headerClassName: 'w-40', cell: (row) => formatDateTime(row.movementDate) },
    { header: 'Account', headerClassName: 'w-40', cell: (row) => `${row.accountName} (${row.accountType === 'CASH' ? 'Cash' : 'Bank'})` },
    { header: 'Direction', headerClassName: 'w-24', cell: (row) => <StatusBadge value={row.direction} /> },
    { header: 'Source', headerClassName: 'w-44', cell: (row) => titleCase(String(row.sourceType ?? '').replace(/_/g, ' ')) },
    { header: 'Description', cell: (row) => String(row.description ?? '-') },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="FUNDS · TRANSFERS · RECONCILIATION"
        title="Cash & Bank"
        description="Opening balances plus recorded inflows less outflows. Account transfers move funds without creating income or expense."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>
              <Download className="h-4 w-4" /> Export ledger
            </Button>
            <PermissionGate requires={PERMISSIONS.TRANSFER_CREATE}>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer
              </Button>
            </PermissionGate>
            <PermissionGate requires={PERMISSIONS.RECONCILIATION_CREATE}>
              <Button size="sm" onClick={() => setReconOpen(true)} className="bg-teal-700 hover:bg-teal-800 text-white shadow-xs">
                <Banknote className="h-4 w-4" /> Daily close
              </Button>
            </PermissionGate>
          </>
        }
      />

      {/* 3 Stat Cards matching Replit Cash & Bank */}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatCard
          label="Cash balance"
          value={<Money value={cashBalance} />}
          hint={`${cashAccounts.length} cash account(s) · Mach counter`}
          icon={<Wallet className="h-5 w-5" />}
          variant="cyan"
          loading={accounts.isLoading}
        />
        <StatCard
          label="Bank balance"
          tone="info"
          value={<Money value={bankBalance} />}
          hint={`${bankAccounts.length} bank account(s) · Meezan`}
          icon={<Banknote className="h-5 w-5" />}
          variant="emerald"
          loading={accounts.isLoading}
        />
        <StatCard
          label="Total recorded funds"
          tone="positive"
          value={<Money value={cashBalance + bankBalance} />}
          hint="Reconciled treasury total"
          variant="blue"
          loading={accounts.isLoading}
        />
      </div>

      <Tabs defaultValue="movements">
        <TabsList className="flex-wrap">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="movements">Cash movements</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="closing">Daily closings</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(accounts.data ?? []).map((account: AccountRow) => (
              <Card key={account._id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {account.type === 'CASH' ? <Wallet className="h-4 w-4 text-emerald-600" /> : <Banknote className="h-4 w-4 text-sky-600" />}
                      {account.name}
                    </CardTitle>
                    <CardDescription>
                      {account.type === 'CASH' ? 'Cash drawer' : account.bankName ?? 'Bank account'}
                      {account.accountNumber ? ` · ${account.accountNumber}` : ''}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{account.type === 'CASH' ? 'Cash' : 'Bank'}</Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="text-2xl font-semibold"><Money value={account.balancePaisa} /></p>
                  <p className="text-xs text-muted-foreground">Opening balance <Money value={account.openingBalancePaisa} /></p>
                  {account.location && <p className="text-xs text-muted-foreground">Location {titleCase(account.location)}</p>}
                </CardContent>
              </Card>
            ))}
            {(accounts.data?.length ?? 0) === 0 && (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No accounts configured.</CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 border-b p-3">
              <Filter label="From" className="w-40"><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></Filter>
              <Filter label="To" className="w-40"><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></Filter>
              <Filter label="Account" className="w-48">
                <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All accounts</SelectItem>
                    {(accounts.data ?? []).map((account) => (
                      <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Filter>
              <Filter label="Direction" className="w-32">
                <Select value={direction} onValueChange={(v) => { setDirection(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Both</SelectItem>
                    <SelectItem value="IN">In</SelectItem>
                    <SelectItem value="OUT">Out</SelectItem>
                  </SelectContent>
                </Select>
              </Filter>
            </div>
            <DataTable
              columns={movementColumns}
              rows={rows}
              rowKey={(row) => row._id}
              loading={movements.isLoading}
              error={movements.error}
              onRetry={() => void movements.refetch()}
              emptyMessage="No movements in this range."
              maxHeight="32rem"
              footer={movements.data ? <Pagination page={page} limit={25} total={movements.data.pagination.total} onPageChange={setPage} /> : null}
            />
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cash ↔ bank transfers</CardTitle>
              <CardDescription>A transfer is neither income nor expense — it only moves balances between accounts.</CardDescription>
            </CardHeader>
            <DataTable
              columns={[
                { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.transferDate) },
                { header: 'Reference', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.transferId}</span> },
                { header: 'From', cell: (row) => row.fromAccountName },
                { header: 'To', cell: (row) => row.toAccountName },
                { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} /> },
                { header: 'Notes', cell: (row) => String(row.notes ?? '-') },
              ] as Column<TransferRow>[]}
              rows={(transfers.data ?? []) as TransferRow[]}
              rowKey={(row) => row._id}
              loading={transfers.isLoading}
              emptyMessage="No transfers recorded."
            />
          </Card>
        </TabsContent>

        <TabsContent value="closing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily closing / reconciliation</CardTitle>
              <CardDescription>Counted cash is compared with the system-calculated balance. Differences are recorded, never hidden.</CardDescription>
            </CardHeader>
            <DataTable
              columns={[
                { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.closingDate) },
                { header: 'Account', headerClassName: 'w-40', cell: (row) => `${row.accountName} (${row.accountType === 'CASH' ? 'Cash' : 'Bank'})` },
                { header: 'Opening', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.openingBalancePaisa} /> },
                { header: 'In', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.totalInPaisa} /> },
                { header: 'Out', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.totalOutPaisa} /> },
                { header: 'System', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.systemCalculatedPaisa} /> },
                { header: 'Counted', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.actualCountedPaisa} /> },
                { header: 'Difference', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.differencePaisa} className="font-semibold" /> },
                { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={row.status} /> },
              ] as Column<ReconciliationRow>[]}
              rows={(reconciliations.data ?? []) as ReconciliationRow[]}
              rowKey={(row) => row._id}
              loading={reconciliations.isLoading}
              emptyMessage="No closings recorded yet."
              maxHeight="30rem"
            />
          </Card>
        </TabsContent>
      </Tabs>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} accounts={accounts.data ?? []} />
      <ReconciliationDialog open={reconOpen} onOpenChange={setReconOpen} accounts={accounts.data ?? []} />
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

function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateAccount();
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<'CASH' | 'BANK'>('CASH');
  const [bankName, setBankName] = React.useState('');
  const [accountNumber, setAccountNumber] = React.useState('');
  const [opening, setOpening] = React.useState('');
  const [location, setLocation] = React.useState('ALL');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(''); setType('CASH'); setBankName(''); setAccountNumber(''); setOpening(''); setLocation('ALL'); setFailure(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New financial account</DialogTitle>
          <DialogDescription>Separate cash drawers and bank accounts keep the ledger clear.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Type" required>
            <Select value={type} onValueChange={(v) => setType(v as 'CASH' | 'BANK')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK">Bank</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {type === 'BANK' && (
            <>
              <Field label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
              <Field label="Account number"><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Field>
            </>
          )}
          <Field label="Opening balance (PKR)">
            <Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
          <Field label="Location">
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Both locations</SelectItem>
                <SelectItem value="MACH">Mach</SelectItem>
                <SelectItem value="QUETTA">Quetta</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button
            disabled={create.isPending || !name}
            onClick={async () => {
              setFailure(null);
              try {
                await create.mutateAsync({
                  name,
                  type,
                  bankName: bankName || undefined,
                  accountNumber: accountNumber || undefined,
                  openingBalancePkr: opening ? Number(opening) : undefined,
                  location,
                });
                toast.success('Account created');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {create.isPending ? 'Saving…' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountRow[];
}) {
  const create = useCreateTransfer();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState('BANK');
  const [reference, setReference] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFrom(''); setTo(''); setAmount(''); setDate(todayIso()); setMethod('BANK'); setReference(''); setNotes(''); setFailure(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>Creates one OUT and one IN movement and no income or expense record.</DialogDescription>
        </DialogHeader>
        <InlineAlert tone="info" title="Not revenue, not expense">
          A cash-to-bank transfer changes two balances only. It never appears in the income or expense totals.
        </InlineAlert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From account" required>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account._id} value={account._id}>{account.name} · <Money value={account.balancePaisa} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="To account" required>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a._id !== from).map((account) => (
                  <SelectItem key={account._id} value={account._id}>{account.name} · <Money value={account.balancePaisa} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount (PKR)" required>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <MethodSelect value={method} onChange={setMethod} />
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button
            disabled={create.isPending || !from || !to || from === to || !amount}
            onClick={async () => {
              setFailure(null);
              try {
                await create.mutateAsync({
                  fromAccountId: from,
                  toAccountId: to,
                  amountPkr: Number(amount),
                  transferDate: date,
                  method,
                  reference: reference || undefined,
                  notes: notes || undefined,
                });
                toast.success('Transfer recorded');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {create.isPending ? 'Saving…' : 'Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountRow[];
}) {
  const create = useCreateReconciliation();
  const [accountId, setAccountId] = React.useState('');
  const [closingDate, setClosingDate] = React.useState(todayIso());
  const [counted, setCounted] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setAccountId(''); setClosingDate(todayIso()); setCounted(''); setNotes(''); setFailure(null);
    }
  }, [open]);

  const account = accounts.find((a) => a._id === accountId);
  const difference = counted === '' || !account ? null : Math.round(Number(counted) * 100) - Number(account.balancePaisa);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily closing</DialogTitle>
          <DialogDescription>Records the counted balance against the system balance. Any difference is stored with the closing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account" required className="sm:col-span-2">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((item) => (
                  <SelectItem key={item._id} value={item._id}>{item.name} ({item.type === 'CASH' ? 'Cash' : 'Bank'})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Closing date" required><Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} /></Field>
          <Field label="Actual counted (PKR)" required>
            <Input type="number" step="0.01" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        {account && counted !== '' && (
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <p>System balance <Money value={account.balancePaisa} /> · counted <Money value={Math.round(Number(counted) * 100)} /></p>
            <p className={difference && difference !== 0 ? 'font-semibold text-destructive' : 'font-semibold text-emerald-700'}>
              Difference <Money value={difference ?? 0} />
            </p>
          </div>
        )}
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button
            disabled={create.isPending || !accountId || counted === ''}
            onClick={async () => {
              setFailure(null);
              try {
                await create.mutateAsync({
                  accountId,
                  closingDate,
                  actualCountedPkr: Number(counted),
                  notes: notes || undefined,
                });
                toast.success('Daily closing recorded');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {create.isPending ? 'Saving…' : 'Save closing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
