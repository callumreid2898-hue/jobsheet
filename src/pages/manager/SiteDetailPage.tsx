import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { useSystems } from '../../hooks/useSystems';
import { useJobs } from '../../hooks/useJobs';
import { useRemedials } from '../../hooks/useRemedials';
import { useContracts } from '../../hooks/useContracts';
import { useDevices, useDeviceTests } from '../../hooks/useDevices';
import { useCachedQuery } from '../../hooks/useCachedQuery';
import { useProfiles } from '../../hooks/useProfiles';
import { openStorageFile } from '../../lib/media';
import { formatUKDate } from '../../lib/dates';
import { TEMPLATE_OPTIONS } from '../../templates/labels';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { DeviceRegister } from '../../components/DeviceRegister';
import type { Site, Customer, Job, Jobsheet, RemedialPriority } from '../../types';
import { SYSTEM_TYPE_LABELS, CONTRACT_STATUS_CLASSES } from '../../lib/contracts';

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'systems',   label: 'Systems'   },
  { id: 'devices',   label: 'Devices'   },
  { id: 'jobs',      label: 'Jobs'      },
  { id: 'jobsheets', label: 'Jobsheets' },
  { id: 'remedials', label: 'Remedials' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'notes',     label: 'Notes'     },
];

const REMEDIAL_PRIORITY_CLASSES: Record<RemedialPriority, string> = {
  urgent:      'bg-red-100 text-red-700',
  recommended: 'bg-amber-100 text-amber-700',
  advisory:    'bg-yellow-100 text-yellow-700',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

/** The site's jobsheets, newest first, in a sub-section per sheet type */
function SiteJobsheets({ siteJobs }: { siteJobs: Job[] }) {
  const navigate = useNavigate();
  const sheetType = useActiveTab('sheet', 'all');
  const [openError, setOpenError] = useState<string | null>(null);
  const { rows, isLoading } = useCachedQuery<Jobsheet>({
    table: 'jobsheets', order: { column: 'updated_at', ascending: false },
  });
  const { profiles } = useProfiles({ includeInactive: true });

  const jobById = useMemo(() => new Map(siteJobs.map(j => [j.id, j])), [siteJobs]);
  const sheets = rows.filter(js => jobById.has(js.job_id));
  const types = TEMPLATE_OPTIONS.filter(o => sheets.some(js => js.template_id === o.value));
  const shown = sheetType === 'all' ? sheets : sheets.filter(js => js.template_id === sheetType);

  async function openPdf(path: string) {
    setOpenError(null);
    try { await openStorageFile('pdfs', path); }
    catch (err) { setOpenError(err instanceof Error ? err.message : String(err)); }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (sheets.length === 0) {
    return <EmptyState heading="No jobsheets" description="Jobsheets appear here once an engineer starts one for this site." />;
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Tabs
          tabs={[{ id: 'all', label: `All (${sheets.length})` }, ...types.map(o => ({
            id: o.value, label: `${o.label} (${sheets.filter(js => js.template_id === o.value).length})`,
          }))]}
          paramName="sheet"
          defaultTab="all"
        />
      </div>
      {openError && <p className="text-xs text-red-600" role="alert">Couldn't open the PDF: {openError}</p>}
      {shown.length === 0 ? (
        <EmptyState heading="None of this type" description="No jobsheets of this type for this site." />
      ) : (
        <ul className="space-y-2">
          {shown.map(js => {
            const job = jobById.get(js.job_id)!;
            const engineer = profiles.find(p => p.id === job.assigned_engineer_id)?.full_name;
            const label = TEMPLATE_OPTIONS.find(o => o.value === js.template_id)?.label ?? js.template_id;
            return (
              <li key={js.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <button
                  onClick={() => navigate(`/manager/jobs/${job.id}?tab=jobsheet`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(job.scheduled_date)}{engineer ? ` · ${engineer}` : ''}{job.call_no ? ` · Call ${job.call_no}` : ''}
                  </p>
                </button>
                {js.submitted_at ? (
                  js.pdf_path ? (
                    <button
                      onClick={() => openPdf(js.pdf_path!)}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#0D3349] text-white hover:bg-[#0a2738]"
                    >
                      PDF
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400">Submitted {formatUKDate(js.submitted_at)} · PDF pending</span>
                  )
                ) : (
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In progress</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const activeTab = useActiveTab('tab', 'overview');

  const [site, setSite] = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { systems } = useSystems(siteId);
  const { jobs } = useJobs();
  const { remedials } = useRemedials({ siteId });
  const { contracts } = useContracts({ siteId });
  const { devices } = useDevices({ siteId });
  const { tests } = useDeviceTests(activeTab === 'devices' && devices.length > 0);

  const siteJobs = useMemo(
    () => jobs.filter((j) => j.site_id === siteId),
    [jobs, siteId],
  );

  useEffect(() => {
    if (!siteId) return;
    async function load() {
      setIsLoading(true);
      const s = await fetchOneCached<Site>('sites', siteId!);
      setSite(s);
      if (s?.customer_id) setCustomer(await fetchOneCached<Customer>('customers', s.customer_id));

      setIsLoading(false);
    }
    load();
  }, [siteId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/manager/sites')}
          className="text-[#0D3349] text-sm mb-4 inline-block hover:underline"
        >
          ‹ Back to Sites
        </button>
        <p className="text-center py-12 text-slate-400">Site not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <RecordHeader
        title={site.name}
        subtitle={customer?.name}
        backHref="/manager/sites"
        onBack={() => navigate('/manager/sites')}
        actions={
          <button
            onClick={() => navigate(`/manager/sites/${site.id}/edit`)}
            className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        }
      />

      <Tabs tabs={TABS} paramName="tab" defaultTab="overview" />

      <div className="p-4 sm:p-6">
        {/* ── Overview ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <DetailField label="Address"       value={site.address} />
                {site.job_codes?.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Job codes</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {site.job_codes.map(code => (
                        <span key={code} className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">{code}</span>
                      ))}
                    </dd>
                  </div>
                )}
                {customer && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Customer</dt>
                    <dd className="mt-0.5 text-sm">
                      <Link
                        to={`/manager/customers/${customer.id}`}
                        className="text-[#0D3349] underline underline-offset-2 hover:text-[#DC2626]"
                      >
                        {customer.name}
                      </Link>
                    </dd>
                  </div>
                )}
                <DetailField label="Client No"     value={site.client_no} />
                <DetailField label="Contact"       value={site.contact_name ? `${site.contact_name}${site.contact_phone ? ' · ' + site.contact_phone : ''}` : site.contact_phone} />
                <DetailField label="Access Notes"  value={site.access_notes} />
                <DetailField label="ARC Name"      value={site.arc_name} />
                <DetailField label="ARC Account"   value={site.arc_account} />
                <DetailField label="Police URN"    value={site.police_urn} />
                <DetailField label="Hazards"       value={site.hazards} />
              </dl>
            </div>

            {/* Keyholders */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Keyholders</h2>
              {site.keyholders && site.keyholders.length > 0 ? (
                <ol className="space-y-2">
                  {[...site.keyholders]
                    .sort((a, b) => a.order - b.order)
                    .map((kh, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-sm text-slate-700">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-medium">
                          {kh.order}
                        </span>
                        <span className="font-medium">{kh.name}</span>
                        {kh.phone && (
                          <a href={`tel:${kh.phone}`} className="text-slate-400 hover:text-[#0D3349] ml-auto">
                            {kh.phone}
                          </a>
                        )}
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-400 italic">No keyholders recorded.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Systems ──────────────────────────────────────────── */}
        {activeTab === 'systems' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={() => navigate(`/manager/sites/${site.id}/systems/new`)}
                className="bg-[#0D3349] text-white text-sm font-semibold px-3 py-2 rounded-lg"
              >
                + Add system
              </button>
            </div>
            {systems.length === 0 ? (
              <EmptyState heading="No systems" description="No systems are registered at this site." />
            ) : (
              <ul className="space-y-2">
                {systems.map((sys) => (
                  <li key={sys.id}>
                    <button
                      onClick={() => navigate(`/manager/systems/${sys.id}`)}
                      className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {SYSTEM_TYPE_LABELS[sys.type] ?? sys.type}
                        </p>
                        {(sys.make || sys.model) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {[sys.make, sys.model].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Devices ──────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <DeviceRegister
            devices={devices}
            tests={tests}
            addHref={`/manager/sites/${site.id}/devices/add`}
            emptyText="Add the site's detectors, call points, sounders and fittings to test them on service sheets."
          />
        )}

        {/* ── Jobs ─────────────────────────────────────────────── */}
        {activeTab === 'jobs' && (
          <>
            {siteJobs.length === 0 ? (
              <EmptyState heading="No jobs" description="No jobs have been scheduled for this site." />
            ) : (
              <ul className="space-y-2">
                {siteJobs.map((job) => (
                  <li key={job.id}>
                    <button
                      onClick={() => navigate(`/manager/jobs/${job.id}`)}
                      className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{formatDate(job.scheduled_date)}</p>
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">
                          {job.type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <StatusPill status={job.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Jobsheets ────────────────────────────────────────── */}
        {activeTab === 'jobsheets' && <SiteJobsheets siteJobs={siteJobs} />}

        {/* ── Remedials ────────────────────────────────────────── */}
        {activeTab === 'remedials' && (
          <>
            {remedials.length === 0 ? (
              <EmptyState heading="No remedials" description="No remedials have been raised for this site." />
            ) : (
              <ul className="space-y-2">
                {remedials.map((rem) => (
                  <li
                    key={rem.id}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-800 flex-1">{rem.description}</p>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${REMEDIAL_PRIORITY_CLASSES[rem.priority]}`}>
                          {rem.priority}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                          {rem.status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Contracts ────────────────────────────────────────── */}
        {activeTab === 'contracts' && (
          <>
            {contracts.length === 0 ? (
              <EmptyState heading="No contracts" description="No contracts are linked to this site." />
            ) : (
              <ul className="space-y-2">
                {contracts.map((contract) => (
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
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Access Notes</h2>
              {site.access_notes ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {site.access_notes}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">No access notes recorded.</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Hazards</h2>
              {site.hazards ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {site.hazards}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">No hazards recorded.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
