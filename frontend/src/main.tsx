import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/lib/auth';
import App from './App';
import './index.css';
import { preloadToasts } from '@/lib/notify';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Exponential backoff with a ceiling: on a weak connection this avoids hammering the API
      // while still recovering on its own once the link comes back.
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Financial writes are never retried automatically. A retry must be a deliberate user
      // action, and it is only safe because the request carries an idempotency key.
      retry: false,
      networkMode: 'always',
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={200}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Pull the toast library in once the browser is idle so the first notification is instant,
// without making the initial render wait for it.
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => preloadToasts(), { timeout: 3000 });
} else {
  window.setTimeout(preloadToasts, 1500);
}
