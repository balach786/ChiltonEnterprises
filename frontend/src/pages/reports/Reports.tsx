import * as React from 'react';
import { toast } from '@/lib/notify';
import { Eye, FileSpreadsheet, FileText, Printer, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DataTable, Money } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { ErrorState, InlineAlert } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { exportCustomerStatement, exportReport, useCustomers, useReportCatalog, useReportPreview } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { ReportBundle, ReportSheet } from '@/lib/types';
import { downloadBlob, formatDate, formatDateTime, monthStartIso, titleCase, todayIso } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

const DATE_REPORTS = new Set(['collections', 'expenses', 'cash-bank', 'financial-summary', 'archive']);

export function ReportsPage() {
  const catalog = useReportCatalog();
  const [reportId, setReportId] = React.useState('customers');
  const [dateFrom, setDateFrom] = React.useState(monthStartIso());
  const [dateTo, setDateTo] = React.useState(todayIso());
  const [location, setLocation] = React.useState('ALL');
  const [category, setCategory] = React.useState('');
  const [schemeMonth, setSchemeMonth] = React.useState('');
  const [customerId, setCustomerId] = React.useState('');
  const [customerQuery, setCustomerQuery] = React.useState('');
  const [previewKey, setPreviewKey] = React.useState(0);

  const customers = useCustomers({ search: customerQuery, limit: 20 });

  const isStatement = reportId === 'customer-statement';
  const filters = React.useMemo(
    () => ({
      dateFrom: DATE_REPORTS.has(reportId) || isStatement ? dateFrom : undefined,
      dateTo: DATE_REPORTS.has(reportId) || isStatement ? dateTo : undefined,
      location: location === 'ALL' ? undefined : location,
      category: category || undefined,
      schemeMonth: schemeMonth || undefined,
      customerId: isStatement ? customerId || undefined : undefined,
    }),
    [reportId, isStatement, dateFrom, dateTo, location, category, schemeMonth, customerId]
  );

  const [activeFilters, setActiveFilters] = React.useState(filters);
  const preview = useReportPreview(isStatement && !customerId ? '' : reportId, { ...activeFilters, _key: previewKey });

  const applyFilters = () => {
    setActiveFilters(filters);
    setPreviewKey((key) => key + 1);
  };

  const doExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    try {
      const { blob, filename } = isStatement
        ? await exportCustomerStatement(customerId, activeFilters, format)
        : await exportReport(reportId, activeFilters, format);
      downloadBlob(blob, filename ?? `${reportId}.${format}`);
      toast.success(`${titleCase(reportId)} exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const reports = catalog.data ?? [];

  return (
    <>
      <PageHeader
        title="Reports &amp; exports"
        description="Excel, PDF, CSV and the on-screen preview are all rendered from the same query — so they always agree with each other and with the records."
        actions={
          <PermissionGate
            requires={PERMISSIONS.REPORT_EXPORT}
            fallback={<Badge variant="warning">Your role cannot export reports</Badge>}
          >
            <>
              <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              <Button variant="outline" size="sm" onClick={() => doExport('pdf')}><FileText className="h-4 w-4" /> PDF</Button>
              <Button variant="outline" size="sm" onClick={() => doExport('csv')}><Table2 className="h-4 w-4" /> CSV</Button>
              <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            </>
          </PermissionGate>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Available reports</CardTitle>
            <CardDescription>{reports.length} reports from the live database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {catalog.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => {
                  setReportId(report.id);
                  setPreviewKey((key) => key + 1);
                }}
                className={`w-full rounded-md border p-2.5 text-left text-sm transition-colors ${
                  reportId === report.id ? 'border-primary bg-accent' : 'hover:bg-muted/60'
                }`}
              >
                <p className="font-medium">{report.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{report.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>Applied to the preview and to every export format.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              {(DATE_REPORTS.has(reportId) || isStatement) && (
                <>
                  <FilterField label="From" className="w-40">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </FilterField>
                  <FilterField label="To" className="w-40">
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </FilterField>
                </>
              )}
              {!isStatement && (
                <FilterField label="Location" className="w-32">
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="MACH">Mach</SelectItem>
                      <SelectItem value="QUETTA">Quetta</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
              )}
              {reportId === 'expenses' && (
                <FilterField label="Category" className="w-44">
                  <Input placeholder="e.g. SHOP_RENT" value={category} onChange={(e) => setCategory(e.target.value)} />
                </FilterField>
              )}
              {reportId === 'draws' && (
                <FilterField label="Scheme month" className="w-28">
                  <Input type="number" min={1} max={28} value={schemeMonth} onChange={(e) => setSchemeMonth(e.target.value)} />
                </FilterField>
              )}
              {isStatement && (
                <FilterField label="Customer" className="w-64">
                  <Input
                    placeholder="Search customer, token or CNIC"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setCustomerId('');
                    }}
                  />
                </FilterField>
              )}
              {isStatement && (customers.data?.items.length ?? 0) > 0 && !customerId && (
                <div className="w-full max-h-40 overflow-y-auto rounded-md border scrollbar-thin">
                  {customers.data?.items.map((customer) => (
                    <button
                      key={customer._id}
                      type="button"
                      onClick={() => {
                        setCustomerId(customer._id);
                        setPreviewKey((key) => key + 1);
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60"
                    >
                      <span>{customer.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(customer.tokenNumber ?? '').padStart(3, '0')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button onClick={applyFilters}>
                <Eye className="h-4 w-4" /> Run preview
              </Button>
            </CardContent>
          </Card>

          {isStatement && !customerId ? (
            <InlineAlert tone="warning" title="Select a customer">
              The customer statement report needs a customer. Search and pick one above.
            </InlineAlert>
          ) : preview.isLoading ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : preview.isError ? (
            <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
          ) : (
            <ReportPreviewView bundle={preview.data} />
          )}
        </div>
      </div>
    </>
  );
}

function FilterField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ReportPreviewView({ bundle }: { bundle: ReportBundle | undefined }) {
  if (!bundle) return null;
  return (
    <Card className="print-area">
      <CardHeader>
        <CardTitle className="text-base">{bundle.title}</CardTitle>
        <CardDescription>
          {bundle.period ? `Period ${bundle.period} · ` : ''}generated {formatDateTime(bundle.generatedAt)}
          {bundle.generatedBy ? ` by ${bundle.generatedBy}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={bundle.sheets[0]?.id ?? 'sheet'}>
          {bundle.sheets.length > 1 && (
            <TabsList className="flex-wrap">
              {bundle.sheets.map((sheet) => (
                <TabsTrigger key={sheet.id} value={sheet.id}>{sheet.name}</TabsTrigger>
              ))}
            </TabsList>
          )}
          {bundle.sheets.map((sheet) => (
            <TabsContent key={sheet.id} value={sheet.id}>
              <SheetTable sheet={sheet} />
            </TabsContent>
          ))}
        </Tabs>
        <p className="mt-3 text-xs text-muted-foreground">
          Preview shows the first 100 rows of each sheet. Exports contain every matching record.
        </p>
      </CardContent>
    </Card>
  );
}

function SheetTable({ sheet }: { sheet: ReportSheet }) {
  const rows = sheet.rows.slice(0, 100);
  return (
    <>
      <DataTable
        columns={sheet.columns.map((column) => ({
          header: column.header,
          headerClassName: column.type === 'money' || column.type === 'number' ? 'text-right' : undefined,
          className: column.type === 'money' || column.type === 'number' ? 'text-right' : undefined,
          cell: (row: Record<string, unknown>) => {
            const value = row[column.key];
            if (column.type === 'money') return <Money value={Number(value ?? 0)} />;
            if (column.type === 'date') return formatDate(String(value ?? ''));
            if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">-</span>;
            return String(value);
          },
        }))}
        rows={rows}
        rowKey={(row, index) => String(row.id ?? index)}
        emptyMessage="No rows match these filters."
        maxHeight="30rem"
      />
      {sheet.totals && sheet.totals.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-6 border-t px-4 py-3 text-sm">
          {sheet.totals.map((total) => (
            <span key={total.label}>
              {total.label}{' '}
              {total.money ? (
                <Money value={Math.round(Number(total.value) * 100)} className="font-semibold" />
              ) : (
                <span className="font-semibold tabular-nums">{total.value}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
