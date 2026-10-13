import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown while a lazily-loaded route chunk is fetched. It mirrors the shape of a real page
 * (header, stat cards, table) so the swap feels like the page settling rather than a blank flash.
 */
export function RouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-80 w-full" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
