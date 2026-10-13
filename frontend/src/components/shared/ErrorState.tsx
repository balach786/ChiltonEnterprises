import { Button } from '@/components/ui/button';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { errorMessage } from '@/lib/api';

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center ${className ?? ''}`}>
      <TriangleAlert className="h-7 w-7 text-destructive" />
      <p className="max-w-lg text-sm text-destructive">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  );
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'destructive' | 'success';
  title?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    destructive: 'border-rose-200 bg-rose-50 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  } as const;
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}
