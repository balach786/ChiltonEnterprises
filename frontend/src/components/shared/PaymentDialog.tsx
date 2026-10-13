import * as React from 'react';
import { toast } from '@/lib/notify';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FormError } from '@/components/shared/Form';
import { Money } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAccounts, useInstallments, useRecordPayment } from '@/hooks/useApi';
import { errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/utils';

export interface PaymentTarget {
  customerId: string;
  customerName: string;
  tokenNumber?: number | null;
  enrollmentId?: string | null;
  monthlyAmountPaisa?: number;
}

export function PaymentDialog({
  open,
  onOpenChange,
  target,
  presetMonths,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PaymentTarget | null;
  presetMonths?: number[];
}) {
  const accounts = useAccounts();
  const record = useRecordPayment();
  const [months, setMonths] = React.useState<number[]>(presetMonths ?? []);
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState('CASH');
  const [accountId, setAccountId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [allowCredit, setAllowCredit] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  // One idempotency key per dialog session. Retrying after a dropped response reuses the same key
  // so the server replays the payment it already recorded instead of taking the money twice;
  // reopening the dialog for another payment generates a fresh key.
  const idempotencyKey = React.useRef('');
  React.useEffect(() => {
    if (!open) return;
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    idempotencyKey.current = `ui-${random}-${target?.customerId ?? 'none'}`;
  }, [open, target?.customerId]);

  const installments = useInstallments(
    open && target?.enrollmentId ? { enrollmentId: target.enrollmentId, includeStopped: false } : {}
  );

  const due = React.useMemo(() => {
    const list = installments.data?.items ?? [];
    return list.filter((i) => ['unpaid', 'partial', 'overdue'].includes(i.status));
  }, [installments.data]);

  React.useEffect(() => {
    if (open) {
      const initial = presetMonths ?? due.slice(0, 1).map((i) => i.monthNumber);
      setMonths(initial);
      const dueAmount = due.filter((i) => initial.includes(i.monthNumber)).reduce((sum, i) => sum + i.outstandingPaisa, 0);
      setAmount(dueAmount > 0 ? (dueAmount / 100).toFixed(2) : '');
      setFailure(null);
      setNotes('');
      setDate(todayIso());
      setMethod('CASH');
      setAccountId('');
      setAllowCredit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.customerId]);

  const selectedDue = due
    .filter((i) => months.includes(i.monthNumber))
    .reduce((sum, i) => sum + i.outstandingPaisa, 0);

  const defaultAccount = accounts.data?.find((a) => (method === 'CASH' ? a.type === 'CASH' : a.type === 'BANK') && a.isDefault)
    ?? accounts.data?.find((a) => (method === 'CASH' ? a.type === 'CASH' : a.type === 'BANK'))
    ?? accounts.data?.[0];

  const toggleMonth = (monthNumber: number) => {
    setMonths((current) =>
      current.includes(monthNumber) ? current.filter((m) => m !== monthNumber) : [...current, monthNumber].sort((a, b) => a - b)
    );
  };

  const submit = async () => {
    setFailure(null);
    if (!target) return;
    try {
      const result = await record.mutateAsync({
        customerId: target.customerId,
        enrollmentId: target.enrollmentId ?? undefined,
        monthNumbers: months.length ? months : undefined,
        amountPkr: Number(amount),
        paymentDate: date,
        method,
        accountId: accountId || defaultAccount?._id,
        notes: notes || undefined,
        allowCredit: allowCredit || undefined,
        idempotencyKey: idempotencyKey.current,
      });
      toast.success(
        result.credit
          ? `Payment saved as unallocated customer credit (${result.payment.amountFormatted})`
          : `Payment recorded · receipt ${result.receipt?.number ?? ''} · ${result.allocations.length} installment${result.allocations.length === 1 ? '' : 's'} allocated`,
      );
      onOpenChange(false);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record installment payment</DialogTitle>
          <DialogDescription>
            {target?.customerName}
            {target?.tokenNumber ? ` · token ${String(target.tokenNumber).padStart(3, '0')}` : ''} — one receipt, one
            ledger movement, allocated to the months you select.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Select installment month(s)</Label>
            {installments.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading schedule…</p>
            ) : due.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No payable installments. Months after a confirmed draw are marked “Not applicable”.
              </p>
            ) : (
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md border p-2 scrollbar-thin">
                {due.map((installment) => (
                  <label
                    key={installment._id}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={months.includes(installment.monthNumber)}
                      onCheckedChange={() => toggleMonth(installment.monthNumber)}
                    />
                    <span className="w-20 font-medium">Month {installment.monthNumber}</span>
                    <StatusBadge value={installment.status} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      Due <Money value={installment.scheduledPaisa} /> · Paid <Money value={installment.paidPaisa} />
                    </span>
                    <span className="w-28 text-right font-semibold">
                      <Money value={installment.outstandingPaisa} />
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Selected: {months.length === 0 ? 'none — amount will be held as customer credit' : months.join(', ')} · Outstanding{' '}
              <Money value={selectedDue} />
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (PKR)" required hint={`Selected outstanding: PKR ${(selectedDue / 100).toFixed(2)}`}>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Payment date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Method" required>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="ONLINE">Online / mobile wallet</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account" hint="Defaults to the matching cash/bank account.">
              <Select value={accountId || defaultAccount?._id || ''} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name} ({account.type === 'CASH' ? 'Cash' : 'Bank'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={allowCredit} onCheckedChange={(v) => setAllowCredit(Boolean(v))} />
            <span>
              Allow overpayment as customer credit
              <span className="block text-xs text-muted-foreground">
                Amounts above the selected months are held as credit instead of being rejected.
              </span>
            </span>
          </label>

          <FormError message={failure ?? undefined} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={record.isPending || !amount || Number(amount) <= 0}>
            {record.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
