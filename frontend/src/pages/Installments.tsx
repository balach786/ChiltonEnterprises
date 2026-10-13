import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { exportReport, useInstallments } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Installment } from '@/lib/types';
import { downloadBlob, formatDate, formatNumber, titleCase } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { errorMessage } from '@/lib/api';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'adjusted', label: 'Adjusted' },
];

export function InstallmentsPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = React.useState(params.get('status') ?? 'ALL');
  const [month, setMonth] = React.useState('');
  const [tokenNumber, setTokenNumber] = React.useState('');
  const [dueBefore, setDueBefore] = React.useState('');
  const [includeStopped, setIncludeStopped] = React.useState('false');
  const [page, setPage] = React.useState(1);

  // Debounced so typing a token or month number does not fire a request per keystroke.
  const debouncedToken = useDebouncedValue(tokenNumber);
  const debouncedMonth = useDebouncedValue(month);

  const installments = useInstallments({
    status: status === 'ALL' ? undefined : status,
    monthNumber: debouncedMonth || undefined,
    tokenNumber: debouncedToken || undefined,
    dueBefore: dueBefore || undefined,
    includeStopped: includeStopped === 'true' ? true : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const rows: Installment[] = installments.data?.items ?? [];
  const totals = installments.data?.totals;
  const total = installments.data?.pagination.total ?? 0;

  // Any filter change goes back to the first page, otherwise the table can look empty.
  React.useEffect(() => {
    setPage(1);
  }, [status, debouncedMonth, debouncedToken, dueBefore, includeStopped]);

  const doExport = async () => {
    try {
      const { blob, filename } = await exportReport('customers', { status: status === 'ALL' ? undefined : status }, 'xlsx');
      downloadBlob(blob, filename ?? 'installments.xlsx');
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<Installment>[] = [
    { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono">{row.tokenCode ?? String(row.tokenNumber).padStart(3, '0')}</span> },
    {
      header: 'Customer',
      cell: (row) => {
        const customer = (row.customer ?? {}) as Record<string, unknown>;
        return (
          <div className="min-w-0">
            <span className="font-medium">{String(customer.name ?? '-')}</span>
            <span className="ml-2 text-xs text-muted-foreground">{titleCase(String(customer.location ?? ''))}</span>
          </div>
        );
      },
    },
    { header: 'Month', headerClassName: 'w-20', cell: (row) => String(row.monthNumber).padStart(2, '0') },
    { header: 'Due', headerClassName: 'w-28', cell: (row) => formatDate(row.dueDate) },
    { header: 'Status', headerClassName: 'w-40', cell: (row) => (
      <span className="flex items-center gap-1.5">
        <StatusBadge value={row.status} />
        {row.stoppedAfterDraw && <span className="text-[10px] text-muted-foreground">stopped</span>}
      </span>
    ) },
    { header: 'Amount', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.scheduledPaisa} /> },
    { header: 'Paid', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.paidPaisa} /> },
    { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => <Money value={row.outstandingPaisa} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Installments"
        description="Every installment period across all enrolments. Months after a confirmed draw show as Not applicable."
        actions={
          <Button variant="outline" size="sm" onClick={doExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <Filter label="Status" className="w-40">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setParams(value === 'ALL' ? {} : { status: value });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Month no." className="w-28">
            <Input type="number" min={1} max={120} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Filter>
          <Filter label="Token no." className="w-28">
            <Input type="number" min={1} max={120} value={tokenNumber} onChange={(e) => setTokenNumber(e.target.value)} />
          </Filter>
          <Filter label="Due before" className="w-40">
            <Input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} />
          </Filter>
          <Filter label="Stopped months" className="w-36">
            <Select value={includeStopped} onValueChange={setIncludeStopped}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Hide stopped</SelectItem>
                <SelectItem value="true">Include stopped</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {formatNumber(total)} installment period{total === 1 ? '' : 's'} match
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={installments.isLoading}
          error={installments.error}
          onRetry={() => void installments.refetch()}
          emptyMessage="No installments match these filters."
          maxHeight="36rem"
          footer={
            <div className="space-y-0">
              {/* Totals come from the API over the whole filtered set, not just this page. */}
              <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 text-sm">
                <span>Scheduled <Money value={totals?.scheduledPaisa ?? 0} /></span>
                <span>Collected <Money value={totals?.paidPaisa ?? 0} /></span>
                <span className="font-semibold">Outstanding <Money value={totals?.outstandingPaisa ?? 0} /></span>
              </div>
              <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          }
        />
      </Card>
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
