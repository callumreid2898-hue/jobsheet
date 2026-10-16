import { useState, useMemo } from 'react';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import { useJobs } from '../../hooks/useJobs';
import { useRemedials } from '../../hooks/useRemedials';
import { useSites } from '../../hooks/useSites';
import { useCustomers } from '../../hooks/useCustomers';
import { useContracts } from '../../hooks/useContracts';
import { useInvoices } from '../../hooks/useInvoices';
import { useProfiles } from '../../hooks/useProfiles';
import type {
  Job,
  Remedial,
  Contract,
  Invoice,
  JobStatus,
  InvoiceStatus,
  ContractStatus,
  RemedialPriority,
} from '../../types';

// ─── Synthetic row types for tabs that build derived data ─────────────────────

interface SiteActivityRow {
  id: string;
  site_name: string;
  customer_name: string;
  last_job_date: string;
  open_remedials: number;
  active_contracts: number;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const tabDefs = [
  { id: 'jobs',       label: 'Jobs Summary'    },
  { id: 'remedials',  label: 'Open Remedials'  },
  { id: 'ppm',        label: 'PPM Schedule'    },
  { id: 'invoices',   label: 'Invoice Ageing'  },
  { id: 'activity',   label: 'Site Activity'   },
];

// ─── Jobs Summary Tab ─────────────────────────────────────────────────────────

function JobsTab({
  jobs,
  siteMap,
  profileMap,
}: {
  jobs: Job[];
  siteMap: Map<string, string>;
  profileMap: Map<string, string>;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (dateFrom && j.scheduled_date < dateFrom) return false;
      if (dateTo   && j.scheduled_date > dateTo)   return false;
      if (statusFilter && j.status !== statusFilter) return false;
      return true;
    });
  }, [jobs, dateFrom, dateTo, statusFilter]);

  const columns: Column<Job>[] = [
    {
      key: 'site',
      header: 'Site',
      sortable: true,
      getValue: (j) => siteMap.get(j.site_id) ?? j.site_id,
      render: (j) => <span>{siteMap.get(j.site_id) ?? '—'}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      getValue: (j) => j.type,
      render: (j) => <span className="capitalize">{j.type.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      getValue: (j) => j.status,
      render: (j) => <StatusPill status={j.status} kind="job" />,
    },
    {
      key: 'engineer',
      header: 'Engineer',
      sortable: true,
      getValue: (j) => j.assigned_engineer_id ? (profileMap.get(j.assigned_engineer_id) ?? '') : '',
      render: (j) => <span>{j.assigned_engineer_id ? (profileMap.get(j.assigned_engineer_id) ?? '—') : '—'}</span>,
    },
    {
      key: 'scheduled_date',
      header: 'Scheduled Date',
      sortable: true,
      getValue: (j) => j.scheduled_date,
      render: (j) => <span>{j.scheduled_date}</span>,
    },
  ];

  const JOB_STATUSES: JobStatus[] = [
    'unassigned', 'scheduled', 'travelling', 'on_site',
    'completed', 'awaiting_review', 'reviewed', 'invoiced', 'cancelled',
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as JobStatus | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          >
            <option value="">All Statuses</option>
            {JOB_STATUSES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        {(dateFrom || dateTo || statusFilter) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); }}
            className="text-sm text-slate-500 hover:text-slate-700 underline self-end pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No jobs match the selected filters."
        filterPlaceholder="Search site, type, status…"
        filterFn={(j, q) =>
          (siteMap.get(j.site_id) ?? '').toLowerCase().includes(q) ||
          j.type.toLowerCase().includes(q) ||
          j.status.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ─── Open Remedials Tab ───────────────────────────────────────────────────────

function RemedialsTab({
  remedials,
  siteMap,
}: {
  remedials: Remedial[];
  siteMap: Map<string, string>;
}) {
  const [priorityFilter, setPriorityFilter] = useState<RemedialPriority | ''>('');

  const openRemedials = useMemo(
    () => remedials.filter(r => r.status !== 'done'),
    [remedials],
  );

  const filtered = useMemo(() => {
    if (!priorityFilter) return openRemedials;
    return openRemedials.filter(r => r.priority === priorityFilter);
  }, [openRemedials, priorityFilter]);

  const columns: Column<Remedial>[] = [
    {
      key: 'site',
      header: 'Site',
      sortable: true,
      getValue: (r) => siteMap.get(r.site_id) ?? r.site_id,
      render: (r) => <span>{siteMap.get(r.site_id) ?? '—'}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      getValue: (r) => r.priority,
      render: (r) => {
        const colours: Record<RemedialPriority, string> = {
          urgent:      'bg-red-100 text-red-700',
          recommended: 'bg-amber-100 text-amber-700',
          advisory:    'bg-blue-100 text-blue-700',
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colours[r.priority]}`}>
            {r.priority}
          </span>
        );
      },
    },
    {
      key: 'description',
      header: 'Description',
      getValue: (r) => r.description,
      render: (r) => <span className="line-clamp-2">{r.description}</span>,
    },
    {
      key: 'age',
      header: 'Age',
      sortable: true,
      getValue: (r) => Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000),
      render: (r) => (
        <span>{Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)} days</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      getValue: (r) => r.status,
      render: (r) => (
        <span className="capitalize text-slate-600">{r.status}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Priority</label>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as RemedialPriority | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="recommended">Recommended</option>
            <option value="advisory">Advisory</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No open remedials."
        filterPlaceholder="Search site or description…"
        filterFn={(r, q) =>
          (siteMap.get(r.site_id) ?? '').toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.priority.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ─── PPM Schedule Tab ─────────────────────────────────────────────────────────

function PPMTab({
  contracts,
  siteMap,
}: {
  contracts: Contract[];
  siteMap: Map<string, string>;
}) {
  const [statusFilter, setStatusFilter] = useState<ContractStatus | ''>('');
  const [dueBefore, setDueBefore] = useState('');

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (dueBefore && c.next_visit_due && c.next_visit_due > dueBefore) return false;
      return true;
    });
  }, [contracts, statusFilter, dueBefore]);

  const columns: Column<Contract>[] = [
    {
      key: 'site',
      header: 'Site',
      sortable: true,
      getValue: (c) => siteMap.get(c.site_id) ?? c.site_id,
      render: (c) => <span>{siteMap.get(c.site_id) ?? '—'}</span>,
    },
    {
      key: 'system_type',
      header: 'System Type',
      sortable: true,
      getValue: (c) => c.system_type,
      render: (c) => <span className="capitalize">{c.system_type.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'visit_frequency',
      header: 'Frequency',
      sortable: true,
      getValue: (c) => c.visit_frequency,
      render: (c) => <span className="capitalize">{c.visit_frequency}</span>,
    },
    {
      key: 'next_visit_due',
      header: 'Next Due',
      sortable: true,
      getValue: (c) => c.next_visit_due ?? '',
      render: (c) => <span>{c.next_visit_due ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Contract Status',
      sortable: true,
      getValue: (c) => c.status,
      render: (c) => {
        const colours: Record<ContractStatus, string> = {
          active:  'bg-green-100 text-green-700',
          paused:  'bg-amber-100 text-amber-700',
          expired: 'bg-red-100 text-red-700',
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colours[c.status]}`}>
            {c.status}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ContractStatus | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Due Before</label>
          <input
            type="date"
            value={dueBefore}
            onChange={e => setDueBefore(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No contracts found."
        filterPlaceholder="Search site or system type…"
        filterFn={(c, q) =>
          (siteMap.get(c.site_id) ?? '').toLowerCase().includes(q) ||
          c.system_type.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ─── Invoice Ageing Tab ───────────────────────────────────────────────────────

function InvoicesTab({
  invoices,
  customerMap,
}: {
  invoices: Invoice[];
  customerMap: Map<string, string>;
}) {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');

  const filtered = useMemo(() => {
    if (!statusFilter) return invoices;
    return invoices.filter(i => i.status === statusFilter);
  }, [invoices, statusFilter]);

  const today = new Date().toISOString().slice(0, 10);

  const columns: Column<Invoice>[] = [
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      getValue: (i) => customerMap.get(i.customer_id) ?? i.customer_id,
      render: (i) => <span>{customerMap.get(i.customer_id) ?? '—'}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      sortable: true,
      getValue: (i) => i.reference,
      render: (i) => <span className="font-mono text-sm">{i.reference}</span>,
    },
    {
      key: 'issued_date',
      header: 'Issued',
      sortable: true,
      getValue: (i) => i.issued_date ?? '',
      render: (i) => <span>{i.issued_date ?? '—'}</span>,
    },
    {
      key: 'due_date',
      header: 'Due',
      sortable: true,
      getValue: (i) => i.due_date ?? '',
      render: (i) => <span>{i.due_date ?? '—'}</span>,
    },
    {
      key: 'days_overdue',
      header: 'Days Overdue',
      sortable: true,
      getValue: (i) => {
        if (i.status !== 'overdue' || !i.due_date) return -1;
        return Math.floor((new Date(today).getTime() - new Date(i.due_date).getTime()) / 86400000);
      },
      render: (i) => {
        if (i.status !== 'overdue' || !i.due_date) return <span className="text-slate-400">—</span>;
        const days = Math.floor((new Date(today).getTime() - new Date(i.due_date).getTime()) / 86400000);
        return <span className="text-red-600 font-medium">{days} days</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      getValue: (i) => i.status,
      render: (i) => <StatusPill status={i.status} kind="invoice" />,
    },
    {
      key: 'total',
      header: 'Total',
      getValue: () => '—',
      render: () => <span className="text-slate-400">—</span>,
    },
  ];

  const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'void'];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as InvoiceStatus | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
          >
            <option value="">All Statuses</option>
            {INVOICE_STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No invoices found."
        filterPlaceholder="Search customer or reference…"
        filterFn={(i, q) =>
          (customerMap.get(i.customer_id) ?? '').toLowerCase().includes(q) ||
          i.reference.toLowerCase().includes(q) ||
          i.status.toLowerCase().includes(q)
        }
      />
    </div>
  );
}

// ─── Site Activity Tab ────────────────────────────────────────────────────────

function SiteActivityTab({ rows }: { rows: SiteActivityRow[] }) {
  const columns: Column<SiteActivityRow>[] = [
    {
      key: 'site_name',
      header: 'Site',
      sortable: true,
      getValue: (r) => r.site_name,
      render: (r) => <span>{r.site_name}</span>,
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      getValue: (r) => r.customer_name,
      render: (r) => <span>{r.customer_name}</span>,
    },
    {
      key: 'last_job_date',
      header: 'Last Job Date',
      sortable: true,
      getValue: (r) => r.last_job_date,
      render: (r) => <span>{r.last_job_date || '—'}</span>,
    },
    {
      key: 'open_remedials',
      header: 'Open Remedials',
      sortable: true,
      getValue: (r) => r.open_remedials,
      render: (r) => (
        <span className={r.open_remedials > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}>
          {r.open_remedials}
        </span>
      ),
    },
    {
      key: 'active_contracts',
      header: 'Active Contracts',
      sortable: true,
      getValue: (r) => r.active_contracts,
      render: (r) => <span>{r.active_contracts}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage="No sites found."
      filterPlaceholder="Search site or customer…"
      filterFn={(r, q) =>
        r.site_name.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q)
      }
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const activeTab = useActiveTab('tab', 'jobs');

  const { jobs,      isLoading: jobsLoading      } = useJobs();
  const { remedials, isLoading: remedialsLoading  } = useRemedials();
  const { sites,     isLoading: sitesLoading      } = useSites();
  const { customers, isLoading: customersLoading  } = useCustomers();
  const { contracts, isLoading: contractsLoading  } = useContracts();
  const { invoices,  isLoading: invoicesLoading   } = useInvoices();
  const { profiles,  isLoading: profilesLoading   } = useProfiles();

  const isLoading =
    jobsLoading || remedialsLoading || sitesLoading ||
    customersLoading || contractsLoading || invoicesLoading || profilesLoading;

  // Build lookup maps
  const siteMap     = useMemo(() => new Map(sites.map(s => [s.id, s.address])),        [sites]);
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c.name])),       [customers]);
  const profileMap  = useMemo(() => new Map(profiles.map(p => [p.id, p.full_name])),   [profiles]);

  // Build site activity rows
  const activityRows = useMemo<SiteActivityRow[]>(() => {
    const jobsBySite    = new Map<string, Job[]>();
    const remedialsBySite = new Map<string, Remedial[]>();
    const contractsBySite = new Map<string, Contract[]>();

    for (const j of jobs) {
      if (!jobsBySite.has(j.site_id)) jobsBySite.set(j.site_id, []);
      jobsBySite.get(j.site_id)!.push(j);
    }
    for (const r of remedials) {
      if (!remedialsBySite.has(r.site_id)) remedialsBySite.set(r.site_id, []);
      remedialsBySite.get(r.site_id)!.push(r);
    }
    for (const c of contracts) {
      if (!contractsBySite.has(c.site_id)) contractsBySite.set(c.site_id, []);
      contractsBySite.get(c.site_id)!.push(c);
    }

    return sites.map(site => {
      const siteJobs = jobsBySite.get(site.id) ?? [];
      const dates = siteJobs.map(j => j.scheduled_date).sort();
      const lastJobDate = dates.length > 0 ? dates[dates.length - 1] : '';

      const openRemedials = (remedialsBySite.get(site.id) ?? [])
        .filter(r => r.status !== 'done').length;

      const activeContracts = (contractsBySite.get(site.id) ?? [])
        .filter(c => c.status === 'active').length;

      return {
        id:               site.id,
        site_name:        site.address,
        customer_name:    customerMap.get(site.customer_id) ?? '—',
        last_job_date:    lastJobDate,
        open_remedials:   openRemedials,
        active_contracts: activeContracts,
      };
    });
  }, [sites, jobs, remedials, contracts, customerMap]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0D3349] mb-6">Reports</h1>

      <div className="mb-6">
        <Tabs tabs={tabDefs} paramName="tab" defaultTab="jobs" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div>
          {activeTab === 'jobs' && (
            <JobsTab
              jobs={jobs}
              siteMap={siteMap}
              profileMap={profileMap}
            />
          )}
          {activeTab === 'remedials' && (
            <RemedialsTab
              remedials={remedials}
              siteMap={siteMap}
            />
          )}
          {activeTab === 'ppm' && (
            <PPMTab
              contracts={contracts}
              siteMap={siteMap}
            />
          )}
          {activeTab === 'invoices' && (
            <InvoicesTab
              invoices={invoices}
              customerMap={customerMap}
            />
          )}
          {activeTab === 'activity' && (
            <SiteActivityTab rows={activityRows} />
          )}
        </div>
      )}
    </div>
  );
}
