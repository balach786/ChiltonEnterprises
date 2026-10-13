import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Compass className="h-9 w-9 text-muted-foreground" />
      <h2 className="text-lg font-semibold">Page not found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        That screen does not exist in this application.
      </p>
      <Button asChild size="sm">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
