import * as React from 'react';
import { toast } from '@/lib/notify';
import { Download, Landmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Column, DataTable, Money } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { AccountSelect, MethodSelect } from './Income';
import { exportReport, useAccounts, useCreatePartnerTransaction, usePartnerTransactions, usePartners } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { PartnerRow, PartnerTransactionRow } from '@/lib/types';
import { downloadBlob, formatDate, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function PartnersPage() {
  const partners = usePartners();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const rows: PartnerRow[] = partners.data ?? [];
  const selected = rows.find((row) => row._id === selectedId) ?? rows[0] ?? null;

  const transactions = usePartnerTransactions(selected?._id);
  const txns: PartnerTransactionRow[] = transactions.data?.items ?? [];

  const totals = rows.reduce(
    (acc, row) => ({
      contributed: acc.contributed + Number(row.totalContributedPaisa ?? 0),
      withdrawn: acc.withdrawn + Number(row.totalWithdrawnPaisa ?? 0),
      repaid: acc.repaid + Number(row.totalRepaidPaisa ?? 0),
    }),
    { contributed: 0, withdrawn: 0, repaid: 0 }
  );

  const doExport = async () => {
    try {
      const { blob, filename } = await exportReport('partners', {}, 'xlsx');
      downloadBlob(blob, filename ?? 'partners.xlsx');
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<PartnerTransactionRow>[] = [
    { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(row.transactionDate) },
    { header: 'Reference', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.transactionId}</span> },
    { header: 'Type', headerClassName: 'w-36', cell: (row) => <StatusBadge value={row.type} label={titleCase(row.type)} /> },
    { header: 'Effect', headerClassName: 'w-36', cell: (row) => (
      <span className={Number(row.cashEffectPaisa) < 0 ? 'text-destructive' : 'text-emerald-700'}>
        {Number(row.cashEffectPaisa) < 0 ? 'Cash out' : Number(row.cashEffectPaisa) > 0 ? 'Cash in' : 'No cash effect'}
      </span>
    ) },
    { header: 'Account', headerClassName: 'w-36', cell: (row) => String(row.accountName ?? '-') },
    { header: 'Purpose', cell: (row) => String(row.purpose ?? '-') },
    { header: 'Amount', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.amountPaisa} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Partner accounts"
        description="Contributions, withdrawals and repayments for each partner — tracked separately from shop expenses."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={doExport}><Download className="h-4 w-4" /> Excel</Button>
            <PermissionGate requires={PERMISSIONS.PARTNER_TXN_CREATE}>
              <Button size="sm" onClick={() => setOpen(true)} disabled={!selected}><Plus className="h-4 w-4" /> Record transaction</Button>
            </PermissionGate>
          </>
        }
      />

      <InlineAlert tone="info" title="How partner money is classified">
        A contribution increases cash but is <strong>not revenue</strong>. A withdrawal is cash outflow but is{' '}
        <strong>not an operating expense</strong>. Both are still included in total cash inflow / outflow.
      </InlineAlert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Partners" value={rows.length} icon={<Landmark className="h-5 w-5" />} loading={partners.isLoading} />
        <StatCard label="Total contributions" tone="info" value={<Money value={totals.contributed} />} hint="Funding, not revenue" loading={partners.isLoading} />
        <StatCard label="Total withdrawals" tone="negative" value={<Money value={totals.withdrawn} />} hint="Cash outflow, not operating expense" loading={partners.isLoading} />
        <StatCard label="Total repaid" tone="positive" value={<Money value={totals.repaid} />} hint="Partner repayments received" loading={partners.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partners</CardTitle>
            <CardDescription>Select a partner to see their ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {partners.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {rows.map((partner) => (
              <button
                key={partner._id}
                type="button"
                onClick={() => setSelectedId(partner._id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  selected?._id === partner._id ? 'border-primary bg-accent' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{partner.name}</p>
                  <span className="font-mono text-xs text-muted-foreground">{partner.partnerCode}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contributed <Money value={partner.totalContributedPaisa} /> · withdrawn <Money value={partner.totalWithdrawnPaisa} />
                </p>
                <p className="mt-1 text-sm font-semibold">
                  Net cash position <Money value={partner.netCashPaisa} />
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{selected?.name ?? 'Partner'} ledger</CardTitle>
              <CardDescription>All transactions recorded against this partner.</CardDescription>
            </div>
            <Select value={selected?._id ?? ''} onValueChange={setSelectedId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {rows.map((partner) => (
                  <SelectItem key={partner._id} value={partner._id}>{partner.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <DataTable
            columns={columns}
            rows={txns}
            rowKey={(row) => row._id}
            loading={transactions.isLoading}
            error={transactions.error}
            emptyMessage="No transactions for this partner yet."
            maxHeight="30rem"
          />
        </Card>
      </div>

      <PartnerTxnDialog open={open} onOpenChange={setOpen} partner={selected} />
    </>
  );
}

function PartnerTxnDialog({
  open,
  onOpenChange,
  partner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: PartnerRow | null;
}) {
  const accounts = useAccounts();
  const create = useCreatePartnerTransaction();
  const [type, setType] = React.useState('WITHDRAWAL');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState('CASH');
  const [accountId, setAccountId] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setType('WITHDRAWAL');
      setAmount('');
      setDate(todayIso());
      setMethod('CASH');
      setAccountId('');
      setPurpose('');
      setReference('');
      setFailure(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partner transaction — {partner?.name}</DialogTitle>
          <DialogDescription>Withdrawals and contributions move cash but never touch revenue or operating expenses.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transaction type" required className="sm:col-span-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WITHDRAWAL">Withdrawal — partner takes cash out</SelectItem>
                <SelectItem value="CONTRIBUTION">Contribution — partner puts cash in</SelectItem>
                <SelectItem value="REPAYMENT">Repayment — partner pays back</SelectItem>
                <SelectItem value="CORRECTION">Correction — balance adjustment</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount (PKR)" required>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <MethodSelect value={method} onChange={setMethod} />
          <AccountSelect accounts={accounts.data ?? []} method={method} value={accountId} onChange={setAccountId} />
          <Field label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
        <FormError message={failure ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button
            disabled={create.isPending || !amount || !partner}
            onClick={async () => {
              setFailure(null);
              if (!partner) return;
              try {
                await create.mutateAsync({
                  id: partner._id,
                  type,
                  amountPkr: Number(amount),
                  transactionDate: date,
                  method,
                  accountId: accountId || undefined,
                  purpose: purpose || undefined,
                  reference: reference || undefined,
                });
                toast.success('Partner transaction recorded');
                onOpenChange(false);
              } catch (error) {
                setFailure(errorMessage(error));
              }
            }}
          >
            {create.isPending ? 'Saving…' : 'Save transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
