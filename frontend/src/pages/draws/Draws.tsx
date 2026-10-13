import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/lib/notify';
import { Ban, CheckCircle2, Download, Pencil, Plus, Search, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable, Money } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { Textarea } from '@/components/ui/textarea';
import {
  exportReport,
  useConfirmDraw,
  useCorrectDraw,
  useCreateDraw,
  useDraws,
  useEligible,
  useSettings,
  useVoidDraw,
} from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { DrawRow } from '@/lib/types';
import { downloadBlob, formatDate, formatDateTime, formatNumber, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function DrawsPage() {
  const settings = useSettings();
  const [status, setStatus] = React.useState('ALL');
  const [month, setMonth] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<DrawRow | null>(null);
  const [voiding, setVoiding] = React.useState<DrawRow | null>(null);
  const [correcting, setCorrecting] = React.useState<DrawRow | null>(null);

  const draws = useDraws({ status: status === 'ALL' ? undefined : status, schemeMonth: month || undefined });
  const confirmDraw = useConfirmDraw();
  const voidDraw = useVoidDraw();
  const correctDraw = useCorrectDraw();
  const [correctWinner, setCorrectWinner] = React.useState('');
  const [correctDate, setCorrectDate] = React.useState('');
  const [correctReason, setCorrectReason] = React.useState('');

  const rows: DrawRow[] = draws.data ?? [];

  const doExport = async (format: 'xlsx' | 'pdf') => {
    try {
      const { blob, filename } = await exportReport('draws', { schemeMonth: month || undefined }, format);
      downloadBlob(blob, filename ?? `draws.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<DrawRow>[] = [
    { header: 'Scheme month', headerClassName: 'w-28', cell: (row) => <span className="font-mono font-semibold">{String(row.schemeMonth).padStart(2, '0')} / 28</span> },
    { header: 'Draw date', headerClassName: 'w-28', cell: (row) => formatDate(row.drawDate) },
    { header: 'Eligible', headerClassName: 'w-24', cell: (row) => formatNumber(row.eligibleCount) },
    {
      header: 'Winner',
      cell: (row) =>
        row.winnerTokenNumber ? (
          <span>
            <span className="font-mono font-semibold text-amber-700">{row.tokenCode}</span>
            <span className="ml-2">{row.winnerName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Not selected</span>
        ),
    },
    { header: 'Status', headerClassName: 'w-32', cell: (row) => <StatusBadge value={row.status} /> },
    { header: 'Recorded by', headerClassName: 'w-36', cell: (row) => String(row.operatorName ?? '-') },
    { header: 'Approved by', headerClassName: 'w-36', cell: (row) => String(row.approvedByName ?? '-') },
    { header: 'Confirmed', headerClassName: 'w-40', cell: (row) => formatDateTime(row.confirmedAt) },
    {
      header: '',
      headerClassName: 'w-52',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <PermissionGate requires={PERMISSIONS.DRAW_CONFIRM}>
            {row.status === 'DRAFT' && row.winnerTokenNumber && (
              <Button size="sm" onClick={() => setConfirming(row)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
              </Button>
            )}
          </PermissionGate>
          <PermissionGate requires={PERMISSIONS.DRAW_CORRECT}>
            {['CONFIRMED', 'CORRECTED'].includes(row.status) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCorrecting(row);
                    setCorrectWinner(row.winnerTokenNumber ? String(row.winnerTokenNumber) : '');
                    setCorrectDate(row.drawDate ? String(row.drawDate).slice(0, 10) : '');
                    setCorrectReason('');
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setVoiding(row)}>
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Monthly Qurandazi draw"
        description="The eligible pool is snapshotted at draw time. Confirming a draw closes that customer's scheme and stops every later installment."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={() => doExport('pdf')}><Download className="h-4 w-4" /> PDF</Button>
            <PermissionGate requires={PERMISSIONS.DRAW_CREATE}>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New draw
              </Button>
            </PermissionGate>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Filter label="Scheme month" className="w-32">
            <Input type="number" min={1} max={28} placeholder="1–28" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Filter>
          <Filter label="Status" className="w-40">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="CORRECTED">Corrected</SelectItem>
                <SelectItem value="VOIDED">Voided</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {formatNumber(rows.length)} draws · current scheme month {settings.data?.currentSchemeMonth ?? '-'}
          </p>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={draws.isLoading}
          error={draws.error}
          onRetry={() => void draws.refetch()}
          emptyMessage="No draws recorded yet."
          emptyHint={
            <PermissionGate requires={PERMISSIONS.DRAW_CREATE}>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Record the first draw
              </Button>
            </PermissionGate>
          }
        />
      </Card>

      <CreateDrawDialog open={createOpen} onOpenChange={setCreateOpen} defaultMonth={settings.data?.currentSchemeMonth ?? 1} />

      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Confirm month ${confirming?.schemeMonth} draw`}
        confirmLabel="Confirm draw"
        submitting={confirmDraw.isPending}
        onConfirm={async () => {
          if (!confirming) return;
          try {
            const result = await confirmDraw.mutateAsync(confirming._id);
            toast.success(`Draw confirmed · ${result.stoppedInstallments} future installments stopped`);
            setConfirming(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      >
        <InlineAlert tone="warning" title="This action changes the installment schedule">
          Token <strong>{confirming?.tokenCode}</strong> ({confirming?.winnerName}) wins. Every installment from month{' '}
          {confirming?.schemeMonth} onwards becomes <strong>Not applicable</strong> and is excluded from collection lists
          and reports. Payments already made are preserved.
        </InlineAlert>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(voiding)}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Void this draw"
        description="The draw record is kept with its history and marked voided. Any closure is reopened and the stopped installments are restored."
        confirmLabel="Void draw"
        tone="destructive"
        requireReason
        submitting={voidDraw.isPending}
        onConfirm={async (reason) => {
          if (!voiding || !reason) return;
          try {
            await voidDraw.mutateAsync({ id: voiding._id, reason });
            toast.success('Draw voided');
            setVoiding(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />

      <Dialog open={Boolean(correcting)} onOpenChange={(open) => !open && setCorrecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct draw for month {correcting?.schemeMonth}</DialogTitle>
            <DialogDescription>
              The previous winner and the original values stay in the correction history — nothing is overwritten silently.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="New winner token" hint="Must be in the eligible snapshot for this month.">
              <Input type="number" min={1} max={120} value={correctWinner} onChange={(e) => setCorrectWinner(e.target.value)} />
            </Field>
            <Field label="Draw date">
              <Input type="date" value={correctDate} onChange={(e) => setCorrectDate(e.target.value)} />
            </Field>
            <Field label="Reason" required>
              <Textarea rows={2} value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} />
            </Field>
            {correcting && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Current values</p>
                <p>Winner token {correcting.tokenCode ?? '-'} ({correcting.winnerName ?? '-'}) · {formatDate(correcting.drawDate)}</p>
                {correcting.corrections.map((correction, index) => (
                  <p key={index} className="mt-1">
                    Correction {index + 1}: {correction.reason} — {formatDateTime(correction.correctedAt)}
                  </p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrecting(null)}>Cancel</Button>
            <Button
              disabled={correctDraw.isPending || correctReason.trim().length < 5}
              onClick={async () => {
                if (!correcting) return;
                try {
                  await correctDraw.mutateAsync({
                    id: correcting._id,
                    newWinnerTokenNumber: correctWinner ? Number(correctWinner) : undefined,
                    drawDate: correctDate || undefined,
                    reason: correctReason.trim(),
                  });
                  toast.success('Draw corrected and history preserved');
                  setCorrecting(null);
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {correctDraw.isPending ? 'Saving…' : 'Apply correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function CreateDrawDialog({
  open,
  onOpenChange,
  defaultMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMonth: number;
}) {
  const createDraw = useCreateDraw();
  const [schemeMonth, setSchemeMonth] = React.useState(String(defaultMonth));
  const [drawDate, setDrawDate] = React.useState(todayIso());
  const [location, setLocation] = React.useState('ALL');
  const [reference, setReference] = React.useState('');
  const [winner, setWinner] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  const eligible = useEligible({ schemeMonth: Number(schemeMonth) || undefined, location: location === 'ALL' ? undefined : location });

  React.useEffect(() => {
    if (open) {
      setSchemeMonth(String(defaultMonth));
      setDrawDate(todayIso());
      setLocation('ALL');
      setReference('');
      setWinner('');
      setNotes('');
      setFailure(null);
    }
  }, [open, defaultMonth]);

  const items = eligible.data?.items ?? [];

  const submit = async (confirm: boolean) => {
    setFailure(null);
    try {
      await createDraw.mutateAsync({
        schemeMonth: Number(schemeMonth),
        drawDate,
        winnerTokenNumber: winner ? Number(winner) : undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        confirm,
      });
      toast.success(confirm ? 'Draw created and confirmed' : 'Draft draw created');
      onOpenChange(false);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record a draw</DialogTitle>
          <DialogDescription>
            The eligible list is a snapshot of every customer who has paid the installments due before this month.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="draw">
          <TabsList>
            <TabsTrigger value="draw">Draw details</TabsTrigger>
            <TabsTrigger value="eligible">Eligible pool ({items.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Scheme month" required hint="1 – 28">
                <Input type="number" min={1} max={28} value={schemeMonth} onChange={(e) => setSchemeMonth(e.target.value)} />
              </Field>
              <Field label="Draw date" required>
                <Input type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} />
              </Field>
              <Field label="Location filter">
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Both locations</SelectItem>
                    <SelectItem value="MACH">Mach</SelectItem>
                    <SelectItem value="QUETTA">Quetta</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Winning token" hint="Leave empty to save as a draft and select the winner later.">
                <Select value={winner} onValueChange={setWinner}>
                  <SelectTrigger><SelectValue placeholder="Not selected" /></SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.tokenNumber} value={String(item.tokenNumber)}>
                        {String(item.tokenNumber).padStart(3, '0')} — {item.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reference" className="sm:col-span-2" hint="Ballot / draw register reference number.">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Field label="Notes" className="sm:col-span-3">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <FormError message={failure ?? undefined} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createDraw.isPending}>Cancel</Button>
              <Button variant="secondary" onClick={() => submit(false)} disabled={createDraw.isPending || !schemeMonth}>
                Save as draft
              </Button>
              <Button onClick={() => submit(true)} disabled={createDraw.isPending || !schemeMonth || !winner}>
                {createDraw.isPending ? 'Saving…' : 'Create & confirm'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="eligible">
            {eligible.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading eligible customers…</p>
            ) : eligible.isError ? (
              <FormError message={errorMessage(eligible.error)} />
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No customers are eligible for month {schemeMonth} with these filters.
              </p>
            ) : (
              <DataTable
                columns={[
                  { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? String(row.tokenNumber).padStart(3, '0'))}</span> },
                  { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
                  { header: 'Location', headerClassName: 'w-24', cell: (row) => <StatusBadge value={String(row.location ?? '')} /> },
                  { header: 'Monthly', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={Number(row.monthlyInstallmentPaisa ?? 0)} /> },
                  { header: 'Paid to date', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={Number(row.totalPaidPaisa ?? 0)} /> },
                  { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={Number(row.outstandingPaisa ?? 0)} /> },
                  { header: 'Advances', headerClassName: 'w-28', cell: (row) => (
                    <span className="flex gap-1">
                      {row.hasAdvanceBike ? <StatusBadge value="info" label="Bike" /> : null}
                      {row.hasAdvanceCash ? <StatusBadge value="warning" label="Cash" /> : null}
                    </span>
                  ) },
                  {
                    header: '',
                    headerClassName: 'w-28',
                    cell: (row) => (
                      <div className="flex justify-end">
                        <Button size="sm" variant={winner === String(row.tokenNumber) ? 'default' : 'outline'} onClick={() => setWinner(String(row.tokenNumber))}>
                          {winner === String(row.tokenNumber) ? 'Selected' : 'Select'}
                        </Button>
                      </div>
                    ),
                  },
                ] as Column<Record<string, unknown>>[]}
                rows={items as unknown as Record<string, unknown>[]}
                rowKey={(row) => String(row.tokenNumber)}
                maxHeight="22rem"
              />
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="h-4 w-4 text-amber-600" />
              <Search className="h-3.5 w-3.5" />
              {formatNumber(items.length)} customers eligible ·{' '}
              {winner ? (
                <>
                  winner token <Badge variant="warning">{String(winner).padStart(3, '0')}</Badge>
                </>
              ) : (
                'no winner selected yet'
              )}
              <Link to="/lists" className="ml-auto underline">Open draw-eligible list</Link>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
