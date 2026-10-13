import * as React from 'react';
import { toast } from '@/lib/notify';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge, MethodBadge } from '@/components/shared/StatusBadge';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Field, FormError } from '@/components/shared/Form';
import { AccountSelect, CategorySelect, MethodSelect } from './Income';
import { exportReport, useAccounts, useCreateExpense, useExpenses, useReverseExpense, useSettingsMeta } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { TransactionRow } from '@/lib/types';
import { downloadBlob, formatDate, monthStartIso, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function ExpensesPage() {
  const [page, setPage] = React.useState(1);
  const [dateFrom, setDateFrom] = React.useState(monthStartIso());
  const [dateTo, setDateTo] = React.useState(todayIso());
  const [category, setCategory] = React.useState('ALL');
  const [location, setLocation] = React.useState('ALL');
  const [open, setOpen] = React.useState(false);
  const [reversing, setReversing] = React.useState<TransactionRow | null>(null);
  const reverse = useReverseExpense();

  const expenses = useExpenses({
    page,
    limit: 25,
    dateFrom,
    dateTo,
    category: category === 'ALL' ? undefined : category,
    location: location === 'ALL' ? undefined : location,
  });

  const rows: TransactionRow[] = expenses.data?.items ?? [];
  const totals = expenses.data?.totals;

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport('expenses', { dateFrom, dateTo, category: category === 'ALL' ? undefined : category }, format);
      downloadBlob(blob, filename ?? `expenses.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<TransactionRow>[] = [
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.transactionDate) },
    { header: 'Reference', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.transactionId}</span> },
    { header: 'Category', headerClassName: 'w-48', cell: (row) => (
      <div>
        <p>{titleCase(row.category.replace(/_/g, ' '))}</p>
        {row.subCategory && <p className="text-xs text-muted-foreground">{row.subCategory}</p>}
      </div>
    ) },
    {
      header: 'Type',
      headerClassName: 'w-40',
      cell: (row) =>
        row.isOperatingExpense ? (
          <Badge variant="destructive">Operating</Badge>
        ) : row.sourceType === 'PARTNER_WITHDRAWAL' ? (
          <Badge variant="warning">Partner withdrawal</Badge>
        ) : (
          <Badge variant="info">Customer advance</Badge>
        ),
    },
    {
      header: 'Paid to',
      headerClassName: 'w-36',
      cell: (row) => String(row.paidTo ?? (row.partner as { name?: string } | undefined)?.name ?? '-'),
    },
    { header: 'Method', headerClassName: 'w-32', cell: (row) => <MethodBadge method={row.method} /> },
    { header: 'Location', headerClassName: 'w-24', cell: (row) => (row.location ? <StatusBadge value={row.location} /> : '-') },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} className="font-medium" /> },
    {
      header: '',
      headerClassName: 'w-16',
      cell: (row) => (
        <div className="flex justify-end">
          <PermissionGate requires={PERMISSIONS.EXPENSE_REVERSE}>
            {row.status === 'posted' && row.sourceType === 'MANUAL' && (
              <Button size="sm" variant="outline" onClick={() => setReversing(row)} title="Reverse">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Operating expenses are kept separate from customer advance cash and partner withdrawals, even though all three are cash outflow."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
            <PermissionGate requires={PERMISSIONS.EXPENSE_CREATE}>
              <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record expense</Button>
            </PermissionGate>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total outflow (range)" value={<Money value={totals?.totalPaisa ?? 0} />} hint="All expense records" loading={expenses.isLoading} />
        <StatCard label="Operating expenses" tone="negative" value={<Money value={totals?.operatingPaisa ?? 0} />} hint="Shop running costs" loading={expenses.isLoading} />
        <StatCard label="Customer advance cash" tone="warning" value={<Money value={totals?.customerAdvancePaisa ?? 0} />} hint="Outflow, not an operating expense" loading={expenses.isLoading} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Filter label="From" className="w-40"><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></Filter>
          <Filter label="To" className="w-40"><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></Filter>
          <Filter label="Category" className="w-52">
            <CategorySelect value={category} onChange={(v) => { setCategory(v); setPage(1); }} kinds={['expense']} />
          </Filter>
          <Filter label="Location" className="w-32">
            <Select value={location} onValueChange={(v) => { setLocation(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="MACH">Mach</SelectItem>
                <SelectItem value="QUETTA">Quetta</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={expenses.isLoading}
          error={expenses.error}
          onRetry={() => void expenses.refetch()}
          emptyMessage="No expenses in this range."
          footer={expenses.data ? <Pagination page={page} limit={25} total={expenses.data.pagination.total} onPageChange={setPage} /> : null}
        />
      </Card>

      <ExpenseDialog open={open} onOpenChange={setOpen} />

      <ConfirmDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse this expense"
        description="A negative mirror entry is written and the cash balance is recalculated. The original record stays for audit."
        confirmLabel="Reverse expense"
        tone="destructive"
        requireReason
        submitting={reverse.isPending}
        onConfirm={async (reason) => {
          if (!reversing || !reason) return;
          try {
            await reverse.mutateAsync({ id: reversing._id, reason });
            toast.success('Expense reversed');
            setReversing(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
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

function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const accounts = useAccounts();
  const meta = useSettingsMeta();
  const createExpense = useCreateExpense();
  const [category, setCategory] = React.useState('');
  const [subCategory, setSubCategory] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState('CASH');
  const [accountId, setAccountId] = React.useState('');
  const [paidTo, setPaidTo] = React.useState('');
  const [location, setLocation] = React.useState('MACH');
  const [purpose, setPurpose] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCategory(meta.data?.settings.expenseCategories[0] ?? '');
      setSubCategory('');
      setAmount('');
      setDate(todayIso());
      setMethod('CASH');
      setAccountId('');
      setPaidTo('');
      setLocation('MACH');
      setPurpose('');
      setFailure(null);
    }
  }, [open, meta.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an operating expense</DialogTitle>
          <DialogDescription>
            Partner withdrawals and customer advance cash are recorded on their own screens so they are never mixed into
            operating expenses.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {(meta.data?.settings.expenseCategories ?? []).map((item: string) => (
                  <SelectItem key={item} value={item}>{titleCase(item.replace(/_/g, ' '))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sub-category"><Input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} /></Field>
          <Field label="Amount (PKR)" required>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <MethodSelect value={method} onChange={setMethod} />
          <AccountSelect accounts={accounts.data ?? []} method={method} value={accountId} onChange={setAccountId} />
          <Field label="Paid to"><Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} /></Field>
          <Field label="Location">
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MACH">Mach</SelectItem>
                <SelectItem value="QUETTA">Quetta</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Purpose" className="sm:col-span-2">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
        </div>
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createExpense.isPending}>Cancel</Button>
          <Button
            disabled={createExpense.isPending || !amount || !category}
            onClick={async () => {
              setFailure(null);
              try {
                await createExpense.mutateAsync({
                  category,
                  subCategory: subCategory || undefined,
                  amountPkr: Number(amount),
                  transactionDate: date,
                  method,
                  accountId: accountId || undefined,
                  paidTo: paidTo || undefined,
                  location,
                  purpose: purpose || undefined,
                });
                toast.success('Expense recorded');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {createExpense.isPending ? 'Saving…' : 'Save expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
