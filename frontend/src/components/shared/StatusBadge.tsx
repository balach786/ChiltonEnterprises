import { Badge } from '@/components/ui/badge';
import { titleCase } from '@/lib/utils';

const MAP: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'muted'> = {
  paid: 'success',
  posted: 'success',
  active: 'info',
  confirmed: 'success',
  settled: 'success',
  approved: 'success',
  assigned: 'info',
  cash: 'muted',
  bank_transfer: 'info',
  cheque: 'info',
  online: 'info',
  mobile_wallet: 'info',
  in: 'success',
  out: 'destructive',

  partial: 'warning',
  draft: 'warning',
  pending: 'warning',
  unpaid: 'muted',
  unassigned: 'muted',
  open: 'warning',
  not_applicable: 'muted',

  overdue: 'destructive',
  reversed: 'destructive',
  voided: 'destructive',
  cancelled: 'destructive',
  corrected: 'warning',
  adjusted: 'warning',
  drawn_closed: 'info',
  inactive: 'muted',
  mach: 'muted',
  quetta: 'muted',
};

export function StatusBadge({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  const variant = MAP[value.toLowerCase()] ?? 'secondary';
  return <Badge variant={variant}>{label ?? titleCase(value)}</Badge>;
}

export function MethodBadge({ method }: { method?: string | null }) {
  if (!method) return <span className="text-muted-foreground">-</span>;
  return <Badge variant="outline">{titleCase(method.replace(/_/g, ' '))}</Badge>;
}
