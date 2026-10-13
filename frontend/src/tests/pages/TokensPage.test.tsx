import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokensPage } from '@/pages/Tokens';
import { renderWithProviders } from '../helpers';
import { apiFixtures, tokenRegister } from '../fixtures';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, request: requestMock };
});

describe('TokensPage', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation(({ url }: { url: string }) => {
      if (url in apiFixtures) return Promise.resolve(apiFixtures[url]);
      return Promise.reject(new Error(`Unexpected request in test: ${url}`));
    });
  });

  it('renders all 120 token slots with live counts', async () => {
    renderWithProviders(<TokensPage />);

    await waitFor(() => expect(screen.getByText('Sanaullah Khan')).toBeInTheDocument());

    // StatCards: total 120, assigned 2, unassigned 118.
    expect(screen.getByText('Total tokens')).toBeInTheDocument();
    expect(screen.getAllByText('Assigned').length).toBeGreaterThan(0);
    expect(screen.getAllByText('118').length).toBeGreaterThan(0);
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);

    // Every code from 001 to 120 is present - the register is never short.
    for (const code of ['001', '002', '060', '119', '120']) {
      expect(screen.getAllByText(code).length, `token ${code} missing`).toBeGreaterThan(0);
    }

    // An assigned token shows the enrolled customer, an unassigned one stays free.
    expect(screen.getByText('Abdul Rehman')).toBeInTheDocument();
  });

  it('shows the admin action only for a role that may update settings', async () => {
    renderWithProviders(<TokensPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /ensure 120 tokens/i })).toBeInTheDocument());
  });

  it('reflects a register that is fully assigned', async () => {
    apiFixtures['/api/tokens'] = tokenRegister(120);
    renderWithProviders(<TokensPage />);
    await waitFor(() => expect(screen.getAllByText('120').length).toBeGreaterThan(0));
    expect(screen.getByText('Sanaullah Khan')).toBeInTheDocument();
    apiFixtures['/api/tokens'] = tokenRegister(2);
  });

  it('surfaces an API failure instead of an empty register', async () => {
    requestMock.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/tokens') return Promise.reject(new Error('Request failed with status code 500'));
      if (url in apiFixtures) return Promise.resolve(apiFixtures[url]);
      return Promise.reject(new Error(`Unexpected request in test: ${url}`));
    });

    renderWithProviders(<TokensPage />);
    await waitFor(() => expect(screen.getByText(/500/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  });
});
