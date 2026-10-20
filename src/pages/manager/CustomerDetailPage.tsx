import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { useSites } from '../../hooks/useSites';
import { useContracts } from '../../hooks/useContracts';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { Customer, ContractStatus } from '../../types';

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'sites',     label: 'Sites'     },
  { id: 'contracts', label: 'Contracts' },
  { id: 'notes',     label: 'Notes'     },
];

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  fire_alarm:          'Fire Alarm',
  emergency_lighting:  'Emergency Lighting',
  cctv:                'CCTV',
  intruder:            'Intruder',
  access_control:      'Access Control',
};

const CONTRACT_STATUS_CLASSES: Record<ContractStatus, string> = {
  active:  'bg-green-100 text-green-700',
  paused:  'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value || '—'}</dd>
    </div>
  );
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const activeTab = useActiveTab('tab', 'overview');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { sites } = useSites();
  const { contracts } = useContracts();

  const customerSites = useMemo(
    () => sites.filter((s) => s.customer_id === customerId),
    [sites, customerId],
  );

  const customerContracts = useMemo(
    () => contracts.filter((c) => c.customer_id === customerId),
    [contracts, customerId],
  );

  useEffect(() => {
    if (!customerId) return;
    async function load() {
      setIsLoading(true);
      setCustomer(await fetchOneCached<Customer>('customers', customerId!));
      setIsLoading(false);
    }
    load();
  }, [customerId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/manager/customers')}
          className="text-[#0D3349] text-sm mb-4 inline-block hover:underline"
        >
          ‹ Back to Customers
        </button>
        <p className="text-center py-12 text-slate-400">Customer not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <RecordHeader
        title={customer.name}
        subtitle={customer.contact_email ?? undefined}
        backHref="/manager/customers"
        onBack={() => navigate('/manager/customers')}
      />

      <Tabs tabs={TABS} paramName="tab" defaultTab="overview" />

      <div className="p-4 sm:p-6">
        {/* ── Overview ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Name"            value={customer.name} />
              <Field label="Contact Name"    value={customer.contact_name} />
              <Field label="Contact Email"   value={customer.contact_email} />
              <Field label="Contact Phone"   value={customer.contact_phone} />
              <div className="sm:col-span-2">
                <Field label="Billing Address" value={customer.billing_address} />
              </div>
              <div className="sm:col-span-2">
                <Field label="Created" value={formatDate(customer.created_at)} />
              </div>
            </dl>
          </div>
        )}

        {/* ── Sites ────────────────────────────────────────────── */}
        {activeTab === 'sites' && (
          <>
            {customerSites.length === 0 ? (
              <EmptyState heading="No sites" description="No sites are linked to this customer yet." />
            ) : (
              <ul className="space-y-2">
                {customerSites.map((site) => (
                  <li key={site.id}>
                    <Link
                      to={`/manager/sites/${site.id}`}
                      className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-800">{site.address}</span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Contracts ────────────────────────────────────────── */}
        {activeTab === 'contracts' && (
          <>
            {customerContracts.length === 0 ? (
              <EmptyState heading="No contracts" description="No contracts are linked to this customer." />
            ) : (
              <ul className="space-y-2">
                {customerContracts.map((contract) => (
                  <li key={contract.id}>
                    <Link
                      to={`/manager/contracts/${contract.id}`}
                      className="block bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {contract.reference ?? '—'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {SYSTEM_TYPE_LABELS[contract.system_type] ?? contract.system_type}
                            {' · '}
                            {contract.visit_frequency}
                          </p>
                          {contract.next_visit_due && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Next visit: {formatDate(contract.next_visit_due)}
                            </p>
                          )}
                        </div>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${CONTRACT_STATUS_CLASSES[contract.status]}`}>
                          {contract.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Notes ────────────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            {customer.notes ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {customer.notes}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">No notes.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
