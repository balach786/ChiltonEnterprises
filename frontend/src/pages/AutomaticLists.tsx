import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/lib/notify';
import { Download, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAutomaticList, useEligible } from '@/hooks/useApi';
import { formatDate, formatNumber, titleCase } from '@/lib/utils';
import { downloadBlob } from '@/lib/utils';
import { exportReport } from '@/hooks/useApi';
import { errorMessage } from '@/lib/api';

type Row = Record<string, unknown>;

interface ListDef {
  id: string;
  label: string;
  description: string;
  columns: Column<Row>[];
  stats: (totals: Record<string, number>) => Array<{ label: string; value: React.ReactNode }>;
  exportId?: string;
}

const money = (row: Row, key: string) => <Money value={Number(row[key] ?? 0)} />;

const PAGE_SIZE = 25;

export function AutomaticListsPage() {
  const [active, setActive] = React.useState('active-collections');
  const [location, setLocation] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const [schemeMonth, setSchemeMonth] = React.useState('1');

  const filters = {
    location: location === 'ALL' ? undefined : location,
    search: debouncedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  };

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, location, active]);
  const list = useAutomaticList(active, filters, active !== 'draw-eligible');
  const eligible = useEligible({ schemeMonth: Number(schemeMonth) || undefined, location: location === 'ALL' ? undefined : location });

  const definitions: ListDef[] = [
    {
      id: 'active-collections',
      label: 'Active collections',
      description: 'Customers still paying — excludes anyone whose draw has been confirmed.',
      exportId: 'customers',
      stats: (totals) => [
        { label: 'Customers', value: formatNumber(totals.count ?? 0) },
        { label: 'Outstanding', value: <Money value={totals.outstandingPaisa ?? 0} /> },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Location', headerClassName: 'w-24', cell: (row) => <StatusBadge value={String(row.location ?? '')} /> },
        { header: 'Monthly', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => money(row, 'monthlyInstallmentPaisa') },
        { header: 'Paid to date', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'totalPaidPaisa') },
        { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingPaisa') },
        { header: 'Advances', headerClassName: 'w-32', cell: (row) => (
          <span className="flex gap-1">
            {row.advanceBikeActive ? <StatusBadge value="info" label="Bike" /> : null}
            {row.advanceCashActive ? <StatusBadge value="warning" label="Cash" /> : null}
          </span>
        ) },
      ],
    },
    {
      id: 'drawn-closed',
      label: 'Drawn & closed',
      description: 'Customers whose draw is confirmed. History stays available for audit.',
      exportId: 'draws',
      stats: (totals) => [{ label: 'Closed customers', value: formatNumber(totals.count ?? 0) }],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Draw month', headerClassName: 'w-28', cell: (row) => String(row.drawMonth ?? '-') },
        { header: 'Draw date', headerClassName: 'w-28', cell: (row) => formatDate(String(row.drawDate ?? '')) },
        { header: 'Stopped from', headerClassName: 'w-32', cell: (row) => `Month ${String(row.stoppedFromMonth ?? '-')}` },
        { header: 'Paid before draw', headerClassName: 'w-36 text-right', className: 'text-right', cell: (row) => money(row, 'totalPaidPaisa') },
        { header: 'Outstanding waived', headerClassName: 'w-36 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingWaivedPaisa') },
        { header: 'Closed', headerClassName: 'w-28', cell: (row) => formatDate(String(row.closedAt ?? '')) },
      ],
    },
    {
      id: 'advance-bike',
      label: 'Advance bike register',
      description: 'Every advance bike case — including customers who later won the draw.',
      exportId: 'advances',
      stats: (totals) => [
        { label: 'Cases', value: formatNumber(totals.count ?? 0) },
        { label: 'Still paying', value: formatNumber(totals.stillPaying ?? 0) },
        { label: 'Later drawn', value: formatNumber(totals.laterDrawn ?? 0) },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Bike', headerClassName: 'w-40', cell: (row) => String(row.bikeModel ?? '-') },
        { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(String(row.advanceDate ?? '')) },
        { header: 'Installments', headerClassName: 'w-32', cell: (row) => (row.installmentsContinue ? <StatusBadge value="paid" label="Continue" /> : <StatusBadge value="overdue" label="Stopped" />) },
        { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={String(row.status ?? '')} /> },
        { header: 'Later drawn', headerClassName: 'w-28', cell: (row) => (row.laterDrawn ? <StatusBadge value="confirmed" label="Won draw later" /> : <span className="text-muted-foreground">-</span>) },
        { header: 'Customer', headerClassName: 'w-32', cell: (row) => <StatusBadge value={String(row.customerStatus ?? '')} /> },
      ],
    },
    {
      id: 'advance-cash',
      label: 'Advance cash register',
      description: 'One line per advance cash case — each with exactly one cash outflow.',
      exportId: 'advances',
      stats: (totals) => [
        { label: 'Cases', value: formatNumber(totals.count ?? 0) },
        { label: 'Total released', value: <Money value={totals.totalPaisa ?? 0} /> },
        { label: 'Later drawn', value: formatNumber(totals.laterDrawn ?? 0) },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Date', headerClassName: 'w-28', cell: (row) => formatDate(String(row.advanceDate ?? '')) },
        { header: 'Amount released', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'amountPaisa') },
        { header: 'Approved by', cell: (row) => String(row.approver ?? '-') },
        { header: 'Installments', headerClassName: 'w-32', cell: (row) => (row.installmentsContinue ? <StatusBadge value="paid" label="Continue" /> : <StatusBadge value="overdue" label="Stopped" />) },
        { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={String(row.status ?? '')} /> },
        { header: 'Customer', headerClassName: 'w-32', cell: (row) => <StatusBadge value={String(row.customerStatus ?? '')} /> },
      ],
    },
    {
      id: 'overdue-partial',
      label: 'Overdue & partial',
      description: 'Installments that need follow-up. Months stopped by a closure are excluded.',
      exportId: 'customers',
      stats: (totals) => [
        { label: 'Overdue', value: formatNumber(totals.overdue ?? 0) },
        { label: 'Partial', value: formatNumber(totals.partial ?? 0) },
        { label: 'Outstanding', value: <Money value={totals.outstandingPaisa ?? 0} /> },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Month', headerClassName: 'w-20', cell: (row) => String(row.monthNumber ?? '-') },
        { header: 'Due', headerClassName: 'w-28', cell: (row) => formatDate(String(row.dueDate ?? '')) },
        { header: 'Status', headerClassName: 'w-28', cell: (row) => <StatusBadge value={String(row.status ?? '')} /> },
        { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingPaisa') },
      ],
    },
    {
      id: 'mach',
      label: 'Mach register',
      description: 'Every customer registered at the Mach location.',
      exportId: 'customers',
      stats: (totals) => [
        { label: 'Customers', value: formatNumber(totals.count ?? 0) },
        { label: 'Active', value: formatNumber(totals.active ?? 0) },
        { label: 'Outstanding', value: <Money value={totals.outstandingPaisa ?? 0} /> },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Status', headerClassName: 'w-32', cell: (row) => <StatusBadge value={String(row.status ?? '')} /> },
        { header: 'Scheme total', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'schemeTotalPaisa') },
        { header: 'Paid', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'totalPaidPaisa') },
        { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingPaisa') },
      ],
    },
    {
      id: 'quetta',
      label: 'Quetta register',
      description: 'Every customer registered at the Quetta location.',
      exportId: 'customers',
      stats: (totals) => [
        { label: 'Customers', value: formatNumber(totals.count ?? 0) },
        { label: 'Active', value: formatNumber(totals.active ?? 0) },
        { label: 'Outstanding', value: <Money value={totals.outstandingPaisa ?? 0} /> },
      ],
      columns: [
        { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? '')}</span> },
        { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
        { header: 'Status', headerClassName: 'w-32', cell: (row) => <StatusBadge value={String(row.status ?? '')} /> },
        { header: 'Scheme total', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'schemeTotalPaisa') },
        { header: 'Paid', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'totalPaidPaisa') },
        { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingPaisa') },
      ],
    },
  ];

  const current = definitions.find((definition) => definition.id === active) ?? definitions[0];
  const rows: Row[] = list.data?.items ?? [];
  const totals = list.data?.totals ?? {};

  const doExport = async () => {
    if (!current.exportId) return;
    try {
      const { blob, filename } = await exportReport(current.exportId, { location: location === 'ALL' ? undefined : location }, 'xlsx');
      downloadBlob(blob, filename ?? `${current.id}.xlsx`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Automatic lists"
        description="Nine live registers built from the same records the rest of the system writes to — never edited by hand."
        actions={
          active !== 'draw-eligible' ? (
            <Button variant="outline" size="sm" onClick={doExport}>
              <Download className="h-4 w-4" /> Export this list
            </Button>
          ) : null
        }
      />

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="flex-wrap">
          {definitions.map((definition) => (
            <TabsTrigger key={definition.id} value={definition.id}>{definition.label}</TabsTrigger>
          ))}
          <TabsTrigger value="draw-eligible">Draw eligible</TabsTrigger>
        </TabsList>

        {definitions.map((definition) => (
          <TabsContent key={definition.id} value={definition.id}>
            {active === definition.id && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {definition.stats(totals).map((stat) => (
                    <StatCard key={stat.label} label={stat.label} value={stat.value} loading={list.isLoading} icon={<ListChecks className="h-5 w-5" />} />
                  ))}
                </div>
                <Card className="mt-4 overflow-hidden">
                  <div className="flex flex-wrap items-end gap-2 border-b p-3">
                    <p className="mr-auto text-sm text-muted-foreground">{definition.description}</p>
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
                    <Filter label="Search" className="w-52">
                      <Input placeholder="Name or token" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </Filter>
                  </div>
                  <DataTable
                    columns={definition.columns}
                    rows={rows}
                    rowKey={(row, index) => String(row._id ?? index)}
                    loading={list.isLoading}
                    error={list.error}
                    onRetry={() => void list.refetch()}
                    emptyMessage="This list is empty right now."
                    maxHeight="34rem"
                    footer={
                      list.data?.pagination ? (
                        <Pagination
                          page={list.data.pagination.page}
                          limit={list.data.pagination.limit}
                          total={list.data.pagination.total}
                          onPageChange={setPage}
                        />
                      ) : null
                    }
                  />
                </Card>
              </>
            )}
          </TabsContent>
        ))}

        <TabsContent value="draw-eligible">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 border-b p-3">
              <p className="mr-auto text-sm text-muted-foreground">
                Customers eligible for the draw of a specific scheme month — installments due before that month must be
                settled.
              </p>
              <Filter label="Scheme month" className="w-28">
                <Input type="number" min={1} max={28} value={schemeMonth} onChange={(e) => setSchemeMonth(e.target.value)} />
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
            </div>
            <DataTable
              columns={[
                { header: 'Token', headerClassName: 'w-20', cell: (row) => <span className="font-mono font-semibold">{String(row.tokenCode ?? String(row.tokenNumber).padStart(3, '0'))}</span> },
                { header: 'Customer', cell: (row) => String(row.customerName ?? '-') },
                { header: 'Location', headerClassName: 'w-24', cell: (row) => <StatusBadge value={String(row.location ?? '')} /> },
                { header: 'Monthly', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => money(row, 'monthlyInstallmentPaisa') },
                { header: 'Paid to date', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'totalPaidPaisa') },
                { header: 'Outstanding', headerClassName: 'w-32 text-right', className: 'text-right', cell: (row) => money(row, 'outstandingPaisa') },
                { header: 'Advances', headerClassName: 'w-28', cell: (row) => (
                  <span className="flex gap-1">
                    {row.hasAdvanceBike ? <StatusBadge value="info" label="Bike" /> : null}
                    {row.hasAdvanceCash ? <StatusBadge value="warning" label="Cash" /> : null}
                  </span>
                ) },
                { header: 'Customer record', headerClassName: 'w-32', cell: (row) => <Link className="text-primary underline" to={`/customers/${String(row.customerId ?? '')}`}>Open</Link> },
              ] as Column<Row>[]}
              rows={(eligible.data?.items ?? []) as unknown as Row[]}
              rowKey={(row) => String(row.tokenNumber)}
              loading={eligible.isLoading}
              error={eligible.error}
              emptyMessage="Nobody is eligible for this month yet."
              maxHeight="30rem"
            />
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        {formatNumber(rows.length)} rows · {titleCase(current.label)}
      </p>
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
