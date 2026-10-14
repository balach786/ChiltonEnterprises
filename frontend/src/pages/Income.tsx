import * as React from 'react';
import { toast } from '@/lib/notify';
import { Download, Plus } from 'lucide-react';
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
import { Field, FormError } from '@/components/shared/Form';
import { Textarea } from '@/components/ui/textarea';
import { exportReport, useAccounts, useCreateIncome, useIncome, useSettingsMeta } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { TransactionRow } from '@/lib/types';
import { downloadBlob, formatDate, monthStartIso, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function IncomePage() {
  const [page, setPage] = React.useState(1);
  const [dateFrom, setDateFrom] = React.useState(monthStartIso());
  const [dateTo, setDateTo] = React.useState(todayIso());
  const [category, setCategory] = React.useState('ALL');
  const [revenueOnly, setRevenueOnly] = React.useState('ALL');
  const [open, setOpen] = React.useState(false);

  const income = useIncome({
    page,
    limit: 25,
    dateFrom,
    dateTo,
    category: category === 'ALL' ? undefined : category,
    revenueOnly: revenueOnly === 'YES' ? true : revenueOnly === 'NO' ? false : undefined,
  });

  const rows: TransactionRow[] = income.data?.items ?? [];
  const totals = income.data?.totals;

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport('collections', { dateFrom, dateTo, category: category === 'ALL' ? undefined : category }, format);
      downloadBlob(blob, filename ?? `income.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<TransactionRow>[] = [
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.transactionDate) },
    { header: 'Reference', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.transactionId}</span> },
    { header: 'Category', headerClassName: 'w-44', cell: (row) => titleCase(row.category.replace(/_/g, ' ')) },
    {
      header: 'Revenue?',
      headerClassName: 'w-28',
      cell: (row) =>
        row.isRevenue ? <Badge variant="success">Revenue</Badge> : <Badge variant="muted">Funding</Badge>,
    },
    { header: 'Source', headerClassName: 'w-36', cell: (row) => titleCase(String(row.sourceType ?? '').replace(/_/g, ' ')) },
    { header: 'Method', headerClassName: 'w-32', cell: (row) => <MethodBadge method={row.method} /> },
    { header: 'Account', headerClassName: 'w-36', cell: (row) => String(row.accountName ?? '-') },
    { header: 'Location', headerClassName: 'w-24', cell: (row) => (row.location ? <StatusBadge value={row.location} /> : '-') },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} className="font-medium" /> },
  ];

  const partnerContributions = rows
    .filter((r) => r.sourceType === 'PARTNER_CONTRIBUTION' || r.category?.toLowerCase().includes('partner'))
    .reduce((sum, r) => sum + Number(r.amountPaisa ?? 0), 0);
  const partnerRepayments = rows
    .filter((r) => r.category?.toLowerCase().includes('repayment'))
    .reduce((sum, r) => sum + Number(r.amountPaisa ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="CASH INFLOW · REVENUE DISTINCTION"
        title="Income & Collections"
        description="Installment income points to payment receipts. Partner capital and repayments are funding inflows, not business revenue."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>
              <Download className="h-4 w-4" /> Export .xlsx
            </Button>
            <PermissionGate requires={PERMISSIONS.INCOME_CREATE}>
              <Button size="sm" onClick={() => setOpen(true)} className="bg-teal-700 hover:bg-teal-800 text-white shadow-xs">
                <Plus className="h-4 w-4" /> Record collection
              </Button>
            </PermissionGate>
          </>
        }
      />

      {/* 4 Stat Cards matching Replit Income & Collections */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard
          label="Customer collections"
          tone="positive"
          value={<Money value={totals?.revenuePaisa ?? 0} />}
          hint="Installment revenue"
          variant="cyan"
          loading={income.isLoading}
        />
        <StatCard
          label="Customer receipts"
          value={rows.filter((r) => r.isRevenue).length}
          hint={`${rows.length} total entries`}
          variant="emerald"
          loading={income.isLoading}
        />
        <StatCard
          label="Partner contributions"
          tone="info"
          value={<Money value={partnerContributions > 0 ? partnerContributions : (totals?.totalPaisa ?? 0) - (totals?.revenuePaisa ?? 0)} />}
          hint="Capital funding (not revenue)"
          variant="blue"
          loading={income.isLoading}
        />
        <StatCard
          label="Partner repayments"
          tone="warning"
          value={<Money value={partnerRepayments} />}
          hint="Cash inflows against advances"
          variant="amber"
          loading={income.isLoading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Filter label="From" className="w-40"><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></Filter>
          <Filter label="To" className="w-40"><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></Filter>
          <Filter label="Category" className="w-52">
            <CategorySelect value={category} onChange={(v) => { setCategory(v); setPage(1); }} kinds={['income']} />
          </Filter>
          <Filter label="Revenue" className="w-36">
            <Select value={revenueOnly} onValueChange={(v) => { setRevenueOnly(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="YES">Revenue only</SelectItem>
                <SelectItem value="NO">Non-revenue</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={income.isLoading}
          error={income.error}
          onRetry={() => void income.refetch()}
          emptyMessage="No income recorded in this range."
          footer={income.data ? <Pagination page={page} limit={25} total={income.data.pagination.total} onPageChange={setPage} /> : null}
        />
      </Card>

      <IncomeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CategorySelect({
  value,
  onChange,
  kinds,
  includeAll = true,
  allLabel = 'All categories',
}: {
  value: string;
  onChange: (value: string) => void;
  kinds: Array<'income' | 'expense' | 'partner'>;
  includeAll?: boolean;
  allLabel?: string;
}) {
  const meta = useSettingsMeta();
  const options = React.useMemo(() => {
    const settings = meta.data?.settings;
    const list: string[] = [];
    for (const kind of kinds) {
      const source = kind === 'expense' ? settings?.expenseCategories ?? [] : settings?.incomeCategories ?? [];
      for (const category of source) if (!list.includes(category)) list.push(category);
    }
    return list;
  }, [meta.data, kinds]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="ALL">{allLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {titleCase(option.replace(/_/g, ' '))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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

export function IncomeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const accounts = useAccounts();
  const meta = useSettingsMeta();
  const createIncome = useCreateIncome();
  const [category, setCategory] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState('CASH');
  const [accountId, setAccountId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCategory(meta.data?.settings.incomeCategories[0] ?? '');
      setAmount('');
      setDate(todayIso());
      setMethod('CASH');
      setAccountId('');
      setReference('');
      setNotes('');
      setFailure(null);
    }
  }, [open, meta.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record income</DialogTitle>
          <DialogDescription>
            Customer installment collections are created automatically when a payment is recorded — this screen is for
            other business income.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required className="sm:col-span-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {(meta.data?.settings.incomeCategories ?? []).map((item: string) => (
                  <SelectItem key={item} value={item}>{titleCase(item.replace(/_/g, ' '))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount (PKR)" required>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <MethodSelect value={method} onChange={setMethod} />
          <AccountSelect accounts={accounts.data ?? []} method={method} value={accountId} onChange={setAccountId} />
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createIncome.isPending}>Cancel</Button>
          <Button
            disabled={createIncome.isPending || !amount || !category}
            onClick={async () => {
              setFailure(null);
              try {
                await createIncome.mutateAsync({
                  category,
                  amountPkr: Number(amount),
                  transactionDate: date,
                  method,
                  accountId: accountId || undefined,
                  reference: reference || undefined,
                  notes: notes || undefined,
                });
                toast.success('Income recorded');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {createIncome.isPending ? 'Saving…' : 'Save income'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MethodSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const meta = useSettingsMeta();
  const methods = meta.data?.settings.paymentMethods ?? ['CASH', 'BANK', 'CHEQUE', 'ONLINE', 'OTHER'];
  return (
    <Field label="Method" required>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {methods.map((method: string) => (
            <SelectItem key={method} value={method}>{titleCase(method.replace(/_/g, ' '))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function AccountSelect({
  accounts,
  method,
  value,
  onChange,
}: {
  accounts: Array<{ _id: string; name: string; type: 'CASH' | 'BANK' }>;
  method: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const preferred = accounts.find((a) => (method === 'CASH' ? a.type === 'CASH' : a.type === 'BANK'));
  return (
    <Field label="Account" hint={value || preferred ? 'Defaults to the matching account.' : 'No accounts configured.'}>
      <Select value={value || preferred?._id || ''} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account._id} value={account._id}>
              {account.name} ({account.type === 'CASH' ? 'Cash' : 'Bank'})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
