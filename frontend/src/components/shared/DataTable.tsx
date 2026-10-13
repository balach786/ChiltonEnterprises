import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Inbox, RefreshCw, TriangleAlert } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { cn, formatPkr } from '@/lib/utils';

export interface Column<T> {
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  footer?: (rows: T[]) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: unknown;
  emptyMessage?: string;
  emptyHint?: React.ReactNode;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  skeletonRows?: number;
  maxHeight?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyMessage = 'No records found.',
  emptyHint,
  onRetry,
  onRowClick,
  footer,
  skeletonRows = 6,
  maxHeight,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-destructive/5 px-6 py-12 text-center">
        <TriangleAlert className="h-8 w-8 text-destructive" />
        <p className="max-w-md text-sm font-medium text-destructive">{errorMessage(error)}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        {emptyHint}
      </div>
    );
  }

  return (
    <div style={maxHeight ? { maxHeight, overflow: 'auto' } : undefined} className="scrollbar-thin rounded-2xl overflow-x-auto w-full border border-slate-100 bg-white shadow-sm">
      <Table className="min-w-full">
        <TableHeader className="sticky top-0 z-10 bg-[#2b474e] text-white">
          <TableRow className="border-b border-teal-800/40 hover:bg-[#2b474e]">
            {columns.map((column, i) => (
              <TableHead key={i} className={cn('text-white text-xs font-semibold whitespace-nowrap', column.headerClassName)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-100">
          {rows.map((row, index) => {
            const isHighlighted = index % 2 === 0;
            return (
              <TableRow
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'transition text-xs',
                  isHighlighted
                    ? 'bg-[#48636b] text-white font-medium hover:bg-[#3d565e]'
                    : 'bg-white hover:bg-slate-50 text-slate-800',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {columns.map((column, i) => (
                  <TableCell key={i} className={cn('whitespace-nowrap sm:whitespace-normal', isHighlighted ? 'text-white' : 'text-slate-800', column.className)}>
                    {column.cell(row, index)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        {columns.some((column) => column.footer) && (
          <TableFooter>
            <TableRow>
              {columns.map((column, i) => (
                <TableCell key={i} className={cn('py-2 text-xs whitespace-nowrap', column.className)}>
                  {column.footer ? column.footer(rows) : null}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {footer}
    </div>
  );
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 border-t px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm">
      <p className="text-muted-foreground tabular-nums text-center sm:text-left">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  const amount = Number(value ?? 0) / 100;
  return (
    <span className={cn('tabular-nums', amount < 0 && 'text-destructive', className)}>{formatPkr(value)}</span>
  );
}
