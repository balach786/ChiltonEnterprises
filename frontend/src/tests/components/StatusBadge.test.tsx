import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MethodBadge, StatusBadge } from '@/components/shared/StatusBadge';

describe('StatusBadge', () => {
  it('renders the installment statuses the scheme defines', () => {
    const { rerender } = render(<StatusBadge value="paid" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();

    rerender(<StatusBadge value="partial" />);
    expect(screen.getByText('Partial')).toBeInTheDocument();

    rerender(<StatusBadge value="overdue" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();

    rerender(<StatusBadge value="not_applicable" />);
    expect(screen.getByText('Not Applicable')).toBeInTheDocument();

    rerender(<StatusBadge value="adjusted" />);
    expect(screen.getByText('Adjusted')).toBeInTheDocument();
  });

  it('accepts an explicit label so stopped-after-draw rows read clearly', () => {
    render(<StatusBadge value="not_applicable" label="Stopped after draw" />);
    expect(screen.getByText('Stopped after draw')).toBeInTheDocument();
  });

  it('shows a dash when there is no value', () => {
    render(<StatusBadge value={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('formats payment methods', () => {
    render(<MethodBadge method="BANK" />);
    expect(screen.getByText('Bank')).toBeInTheDocument();
  });
});
