import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import type { Customer } from '../../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CustomersListPage() {
  const navigate = useNavigate();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { sites, isLoading: sitesLoading } = useSites();

  const isLoading = customersLoading || sitesLoading;

  // Build a map of customer_id → site count
  const siteCountByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const site of sites) {
      map[site.customer_id] = (map[site.customer_id] ?? 0) + 1;
    }
    return map;
  }, [sites]);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      getValue: (c) => c.name,
      render: (c) => <span className="font-medium text-slate-900">{c.name}</span>,
    },
    {
      key: 'contact_name',
      header: 'Contact Name',
      sortable: true,
      getValue: (c) => c.contact_name ?? '',
      render: (c) => <span className="text-slate-600">{c.contact_name ?? '—'}</span>,
    },
    {
      key: 'contact_email',
      header: 'Contact Email',
      getValue: (c) => c.contact_email ?? '',
      render: (c) =>
        c.contact_email ? (
          <a
            href={`mailto:${c.contact_email}`}
            className="text-[#0D3349] underline underline-offset-2 hover:text-[#DC2626]"
            onClick={(e) => e.stopPropagation()}
          >
            {c.contact_email}
          </a>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'contact_phone',
      header: 'Contact Phone',
      getValue: (c) => c.contact_phone ?? '',
      render: (c) => <span className="text-slate-600">{c.contact_phone ?? '—'}</span>,
    },
    {
      key: 'sites',
      header: 'Sites',
      getValue: (c) => siteCountByCustomer[c.id] ?? 0,
      render: (c) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
          {siteCountByCustomer[c.id] ?? 0}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      getValue: (c) => c.created_at,
      render: (c) => <span className="text-slate-500 text-xs">{formatDate(c.created_at)}</span>,
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <a
          href="/manager/sites/create"
          onClick={(e) => {
            e.preventDefault();
            navigate('/manager/sites/create');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D3349] text-white text-sm font-medium rounded-xl hover:bg-[#0f3d57] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Customer
        </a>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          heading="No customers yet"
          description="Create your first customer when adding a site."
          action={
            <button
              onClick={() => navigate('/manager/sites/create')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D3349] text-white text-sm font-medium rounded-xl hover:bg-[#0f3d57] transition-colors"
            >
              Add a Site
            </button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={customers}
          filterPlaceholder="Search customers…"
          filterFn={(c, q) =>
            c.name.toLowerCase().includes(q) ||
            (c.contact_name?.toLowerCase().includes(q) ?? false) ||
            (c.contact_email?.toLowerCase().includes(q) ?? false)
          }
          onRowClick={(c) => navigate(`/manager/customers/${c.id}`)}
        />
      )}
    </div>
  );
}
