import * as React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { tokenStore } from '@/lib/api';

/**
 * Renders a page with the same providers the real app uses.
 * Pass `{ authenticated: false }` to simulate a signed-out visitor (no stored access token).
 */
export function renderWithProviders(ui: React.ReactElement, route = '/', options?: { authenticated?: boolean }) {
  tokenStore.set(options?.authenticated === false ? null : 'test-access-token');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}
