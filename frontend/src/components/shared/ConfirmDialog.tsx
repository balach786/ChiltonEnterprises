import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'default',
  requireReason,
  reasonLabel = 'Reason (required)',
  reasonPlaceholder,
  minReasonLength = 5,
  extraFields,
  onConfirm,
  submitting,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
  extraFields?: React.ReactNode;
  onConfirm: (reason?: string) => void | Promise<void>;
  submitting?: boolean;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const reasonTooShort = Boolean(requireReason) && reason.trim().length < minReasonLength;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {extraFields}
        {requireReason && (
          <div className="space-y-1.5">
            <Label>{reasonLabel}</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Recorded in the audit log. Minimum {minReasonLength} characters.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            disabled={submitting || reasonTooShort}
            onClick={async () => {
              await onConfirm(requireReason ? reason.trim() : undefined);
            }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
