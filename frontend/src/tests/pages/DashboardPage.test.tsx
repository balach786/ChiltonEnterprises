import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { DashboardPage } from '@/pages/Dashboard';
import { renderWithProviders } from '../helpers';
import { apiFixtures } from '../fixtures';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, request: requestMock };
});

describe('DashboardPage', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation(({ url }: { url: string }) => {
      if (url in apiFixtures) return Promise.resolve(apiFixtures[url]);
      return Promise.reject(new Error(`Unexpected request in test: ${url}`));
    });
  });

  it('renders every headline number from the API summary', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getAllByText(/200,500\.00/).length).toBeGreaterThan(0));

    // Operating expenses and partner withdrawals are reported separately (PRD rule 11).
    expect(screen.getAllByText(/18,100\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/25,000\.00/).length).toBeGreaterThan(0);
    // Customer advances are cash outflow but not operating expense (compact hint).
    expect(screen.getByText(/Outflow this month PKR 70\.0k/)).toBeInTheDocument();
    expect(screen.getByText('Cash outflow · not operating expense')).toBeInTheDocument();
    // Cash + bank combined balance.
    expect(screen.getAllByText(/155,000\.00/).length).toBeGreaterThan(0);
  });

  it('shows the token, customer, advance and draw counters', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('6 / 120')).toBeInTheDocument());
    expect(screen.getByText(/114 unassigned/)).toBeInTheDocument();
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(0);
  });

  it('lists recent transactions and alerts from the backend', async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/Receipt RCPT-000001/)).toBeInTheDocument());
    expect(screen.getByText('Shop rent')).toBeInTheDocument();
    expect(screen.getByText(/3 installments are overdue/)).toBeInTheDocument();
  });
});
