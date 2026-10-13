import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus, Search, UserPlus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable, Money, Pagination } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CustomerFormDialog } from './CustomerFormDialog';
import { PaymentDialog } from '@/components/shared/PaymentDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCustomers, exportReport } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { CustomerRow } from '@/lib/types';
import { downloadBlob, formatDate } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { errorMessage } from '@/lib/api';

export function CustomerListPage() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search);
  const [location, setLocation] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');
  const [drawStatus, setDrawStatus] = React.useState('ALL');
  const [advanceType, setAdvanceType] = React.useState('ALL');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerRow | null>(null);
  const [paying, setPaying] = React.useState<CustomerRow | null>(null);

  // Back to page 1 whenever the debounced search actually changes.
  React.useEffect(() => {
    setPage(1);
  }, [debounced]);

  const filters = {
    page,
    limit: 25,
    search: debounced || undefined,
    location: location === 'ALL' ? undefined : location,
    status: status === 'ALL' ? undefined : status,
    drawStatus: drawStatus === 'ALL' ? undefined : drawStatus,
    advanceType: advanceType === 'ALL' ? undefined : advanceType,
  };

  const customers = useCustomers(filters);
  const [exporting, setExporting] = React.useState(false);

  const doExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const { blob, filename } = await exportReport(
        'customers',
        { location: filters.location, status: filters.status },
        format
      );
      downloadBlob(blob, filename ?? `customers.${format}`);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<CustomerRow>[] = [
    {
      header: 'Token',
      headerClassName: 'w-20',
      cell: (row) => (
        <span className="font-mono text-sm font-semibold">{row.tokenNumber ? String(row.tokenNumber).padStart(3, '0') : '-'}</span>
      ),
    },
    {
      header: 'Customer',
      cell: (row) => (
        <div className="min-w-0">
          <Link to={`/customers/${row._id}`} className="font-medium text-primary hover:underline">
            {row.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {row.customerCode} · {row.fatherName ? `${row.fatherName} · ` : ''}
            {row.phone}
          </p>
        </div>
      ),
    },
    { header: 'CNIC', headerClassName: 'w-36', cell: (row) => <span className="font-mono text-xs">{row.cnic}</span> },
    { header: 'Location', headerClassName: 'w-24', cell: (row) => <StatusBadge value={row.location} /> },
    { header: 'Joined', headerClassName: 'w-28', cell: (row) => formatDate(row.joiningDate) },
    {
      header: 'Monthly',
      headerClassName: 'w-28 text-right',
      className: 'text-right',
      cell: (row) => <Money value={row.monthlyInstallmentPaisa} />,
    },
    { header: 'Paid', headerClassName: 'w-28 text-right', className: 'text-right', cell: (row) => <Money value={row.totalPaidPaisa} /> },
    {
      header: 'Outstanding',
      headerClassName: 'w-32 text-right',
      className: 'text-right',
      cell: (row) => <Money value={row.outstandingPaisa} className="font-medium" />,
    },
    {
      header: 'Status',
      headerClassName: 'w-40',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge value={row.status} />
          {row.advanceBikeActive && <Badge variant="info">Bike</Badge>}
          {row.advanceCashActive && <Badge variant="warning">Cash</Badge>}
        </div>
      ),
    },
    {
      header: '',
      headerClassName: 'w-28',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <PermissionGate requires={PERMISSIONS.PAYMENT_CREATE}>
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setPaying(row);
              }}
              disabled={row.status !== 'active'}
            >
              <Wallet className="h-3.5 w-3.5" /> Pay
            </Button>
          </PermissionGate>
          <PermissionGate requires={PERMISSIONS.CUSTOMER_UPDATE}>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row);
              }}
            >
              Edit
            </Button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every enrolled customer with their token, installment total, amount paid and outstanding balance."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')} disabled={exporting}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('csv')} disabled={exporting}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <PermissionGate requires={PERMISSIONS.CUSTOMER_CREATE}>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" /> Enrol customer
              </Button>
            </PermissionGate>
          </>
        }
      />

      <Card className="overflow-hidden rounded-2xl border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b bg-[#2b474e] p-3 text-white">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, phone, CNIC, code or token number"
              className="pl-9 bg-white text-slate-800 placeholder-slate-400 rounded-full text-xs h-9 border-none shadow-inner"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={location} onValueChange={(v) => { setLocation(v); setPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All locations</SelectItem>
              <SelectItem value="MACH">Mach</SelectItem>
              <SelectItem value="QUETTA">Quetta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="drawn_closed">Drawn &amp; closed</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={drawStatus} onValueChange={(v) => { setDrawStatus(v); setPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any draw</SelectItem>
              <SelectItem value="NONE">Not drawn</SelectItem>
              <SelectItem value="CONFIRMED">Draw won</SelectItem>
            </SelectContent>
          </Select>
          <Select value={advanceType} onValueChange={(v) => { setAdvanceType(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">No advance filter</SelectItem>
              <SelectItem value="BIKE">Advance bike</SelectItem>
              <SelectItem value="CASH">Advance cash</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={customers.data?.items ?? []}
          rowKey={(row) => row._id}
          loading={customers.isLoading}
          error={customers.error}
          onRetry={() => void customers.refetch()}
          emptyMessage="No customers match these filters."
          emptyHint={
            <PermissionGate requires={PERMISSIONS.CUSTOMER_CREATE}>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Enrol the first customer
              </Button>
            </PermissionGate>
          }
          onRowClick={(row) => navigate(`/customers/${row._id}`)}
          footer={
            customers.data ? (
              <Pagination
                page={customers.data.pagination.page}
                limit={customers.data.pagination.limit}
                total={customers.data.pagination.total}
                onPageChange={setPage}
              />
            ) : null
          }
        />
      </Card>

      <CustomerFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editing && (
        <CustomerFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          mode="edit"
          customer={editing as unknown as Record<string, unknown>}
        />
      )}
      <PaymentDialog
        open={Boolean(paying)}
        onOpenChange={(open) => !open && setPaying(null)}
        target={
          paying
            ? {
                customerId: paying._id,
                customerName: paying.name,
                tokenNumber: paying.tokenNumber,
                enrollmentId: paying.enrollmentId,
                monthlyAmountPaisa: paying.monthlyInstallmentPaisa,
              }
            : null
        }
      />
    </>
  );
}
