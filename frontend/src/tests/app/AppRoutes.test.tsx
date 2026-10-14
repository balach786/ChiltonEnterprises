import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import App from '@/App';
import { renderWithProviders } from '../helpers';
import { apiFixtures } from '../fixtures';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, request: requestMock };
});

/**
 * Every route is a dynamic import now (see App.tsx). If one of those `.then(m => m.Xxx)`
 * mappings points at the wrong export name the route renders nothing at runtime while
 * typecheck and unit tests for the page itself still pass - so the wiring is tested here.
 */
describe('App route wiring', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation(({ url }: { url: string }) => {
      if (url in apiFixtures) return Promise.resolve(apiFixtures[url]);
      return Promise.reject(new Error(`Unexpected request in test: ${url}`));
    });
  });

  it('lazy-loads the dashboard for an authenticated owner', async () => {
    renderWithProviders(<App />, '/');

    await waitFor(() => expect(screen.getByText(/The scheme, at a glance\./i)).toBeInTheDocument());
    // Real dashboard data from the fixture, proving the lazy chunk mounted and fetched.
    expect(screen.getByText('Collections this month')).toBeInTheDocument();
    // Regression: a valid token must restore the session in the same commit, otherwise the guard
    // sees one render of `isReady && !isAuthenticated` and dumps the user on the login screen.
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('lazy-loads the login screen when signed out', async () => {
    renderWithProviders(<App />, '/login', { authenticated: false });

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('sends an already signed-in visitor away from the login screen', async () => {
    renderWithProviders(<App />, '/login');

    await waitFor(() => expect(screen.getByText('Collections this month')).toBeInTheDocument());
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('lazy-loads the not-found page for an unknown route', async () => {
    renderWithProviders(<App />, '/this-route-does-not-exist');

    await waitFor(() => expect(screen.getByRole('heading', { name: /404|not found/i })).toBeInTheDocument());
  });
});
