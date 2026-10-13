import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '@/components/shared/DataTable';

interface Row {
  id: string;
  name: string;
  amountPaisa: number;
}

const rows: Row[] = [
  { id: '1', name: 'Sanaullah Khan', amountPaisa: 2500000 },
  { id: '2', name: 'Abdul Rehman', amountPaisa: 1500000 },
];

const columns: Column<Row>[] = [
  { header: 'Customer', cell: (row) => row.name },
  { header: 'Amount', cell: (row) => row.amountPaisa / 100 },
];

describe('DataTable', () => {
  it('renders every row and column', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Sanaullah Khan')).toBeInTheDocument();
    expect(screen.getByText('Abdul Rehman')).toBeInTheDocument();
    expect(screen.getByText('25000')).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    const { container } = render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows the empty message when there is nothing to show', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} emptyMessage="No customers yet." />);
    expect(screen.getByText('No customers yet.')).toBeInTheDocument();
  });

  it('offers a retry when the request failed', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        error={new Error('Network Error')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders footer totals from the rows it was given', () => {
    const totalColumns: Column<Row>[] = [
      columns[0],
      { ...columns[1], footer: (list) => list.reduce((sum, row) => sum + row.amountPaisa, 0) / 100 },
    ];
    render(<DataTable columns={totalColumns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getByText('40000')).toBeInTheDocument();
  });
});
