import { toast } from '@/lib/notify';
import { Badge } from '@/components/ui/badge';
import { DatabaseBackup, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Column, DataTable } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { InlineAlert } from '@/components/shared/ErrorState';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { downloadBackupArchive, useBackups } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import type { BackupRecordRow } from '@/lib/types';
import { downloadBlob, formatDateTime, titleCase } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export function BackupPage() {
  const backups = useBackups();
  const rows: BackupRecordRow[] = backups.data ?? [];

  const doExport = async () => {
    try {
      const { blob, filename } = await downloadBackupArchive();
      downloadBlob(blob, filename ?? `showroom-archive-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Archive downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: Column<BackupRecordRow>[] = [
    { header: 'Label', cell: (row) => <span className="font-medium">{row.label}</span> },
    { header: 'Kind', headerClassName: 'w-24', cell: (row) => <Badge variant="outline">{titleCase(row.kind)}</Badge> },
    { header: 'Format', headerClassName: 'w-24', cell: (row) => row.format.toUpperCase() },
    {
      header: 'Collections',
      headerClassName: 'w-28 text-right',
      className: 'text-right',
      cell: (row) => Object.keys(row.collectionCounts ?? {}).length,
    },
    { header: 'Size', headerClassName: 'w-24 text-right', className: 'text-right', cell: (row) => `${(Number(row.sizeBytes ?? 0) / 1024).toFixed(1)} KB` },
    { header: 'Status', headerClassName: 'w-28', cell: (row) => <Badge variant={row.status === 'COMPLETED' ? 'success' : 'warning'}>{titleCase(row.status)}</Badge> },
    { header: 'Taken', headerClassName: 'w-44', cell: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Backup &amp; restore"
        description="Export the entire database as one JSON archive. Restoring it rebuilds every collection exactly as it was."
        actions={
          <PermissionGate requires={PERMISSIONS.SETTINGS_UPDATE}>
            <Button size="sm" onClick={doExport}>
              <Download className="h-4 w-4" /> Download archive
            </Button>
          </PermissionGate>
        }
      />

      <InlineAlert tone="warning" title="Restore procedure">
        <ol className="mt-1 list-decimal space-y-1 pl-4">
          <li>Download the archive above and keep it somewhere safe.</li>
          <li>
            On the target database run <code className="rounded bg-muted px-1">npx ts-node src/scripts/importArchive.ts &lt;archive.json&gt;</code>.
          </li>
          <li>Sign in and check the customer count, token register and cash balances against the export.</li>
        </ol>
      </InlineAlert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archive history</CardTitle>
            <CardDescription>Every export and restore the system has recorded.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-3xl font-semibold tabular-nums">{rows.length}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length === 0 ? 'no archive yet' : 'operations recorded'}
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recorded operations</CardTitle>
              <CardDescription>All collections are exported and restored together.</CardDescription>
            </div>
            <DatabaseBackup className="h-5 w-5 text-primary" />
          </CardHeader>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row._id}
            loading={backups.isLoading}
            error={backups.error}
            onRetry={() => void backups.refetch()}
            emptyMessage="No archive has been taken yet."
            maxHeight="26rem"
          />
        </Card>
      </div>
    </>
  );
}
