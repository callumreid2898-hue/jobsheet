import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInvoices } from '../../hooks/useInvoices';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import type { Invoice, InvoiceStatus } from '../../types';

const STATUS_FILTERS: { label: string; value: InvoiceStatus | 'all' }[] = [
  { label: 'All',     value: 'all'     },
  { label: 'Draft',   value: 'draft'   },
  { label: 'Sent',    value: 'sent'    },
  { label: 'Paid',    value: 'paid'    },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Void',    value: 'void'    },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function InvoicesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') as InvoiceStatus | null;

  const { invoices, isLoading } = useInvoices(
    statusParam ? { status: statusParam } : undefined,
  );
  const { customers } = useCustomers();
  const { sites } = useSites();

  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c.name])),
    [customers],
  );
  const siteMap = useMemo(
    () => new Map(sites.map(s => [s.id, s.name])),
    [sites],
  );

  const columns: Column<Invoice>[] = [
    {
      key: 'reference',
      header: 'Reference',
      sortable: true,
      getValue: row => row.reference,
      render: row => (
        <span className="font-medium text-slate-900">{row.reference}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      getValue: row => customerMap.get(row.customer_id) ?? '',
      render: row => (
        <span className="text-slate-700">
          {customerMap.get(row.customer_id) ?? '—'}
        </span>
      ),
    },
    {
      key: 'site',
      header: 'Site',
      sortable: true,
      getValue: row => siteMap.get(row.site_id) ?? '',
      render: row => (
        <span className="text-slate-700">
          {siteMap.get(row.site_id) ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: row => <StatusPill status={row.status} kind="invoice" />,
      getValue: row => row.status,
    },
    {
      key: 'due_date',
      header: 'Due Date',
      sortable: true,
      getValue: row => row.due_date ?? '',
      render: row => (
        <span className="text-slate-600">{formatDate(row.due_date)}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: () => <span className="text-slate-400">—</span>,
      getValue: () => '',
    },
  ];

  function setStatusFilter(value: InvoiceStatus | 'all') {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('status');
    } else {
      next.set('status', value);
    }
    setSearchParams(next, { replace: true });
  }

  const activeFilter: InvoiceStatus | 'all' = statusParam ?? 'all';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <button
          onClick={() => navigate('/manager/invoices/create')}
          className="bg-[#0D3349] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#0D3349]/90 transition-colors"
        >
          + New Invoice
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === f.value
                ? 'bg-[#0D3349] text-white border-[#0D3349]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          emptyMessage="No invoices found."
          filterPlaceholder="Search invoices…"
          filterFn={(row, q) => {
            const ref = row.reference.toLowerCase();
            const cust = (customerMap.get(row.customer_id) ?? '').toLowerCase();
            return ref.includes(q) || cust.includes(q);
          }}
          onRowClick={row => navigate(`/manager/invoices/${row.id}`)}
        />
      )}
    </div>
  );
}
