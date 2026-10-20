import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useProfiles } from '../../hooks/useProfiles';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormEngine } from '../../form-engine/FormEngine';
import { fetchCached, fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { openStorageFile } from '../../lib/media';
import { useOnline } from '../../lib/useOnline';
import { supabase } from '../../lib/supabaseClient';
import { isPlannable, managerActions, statusAfterAssign } from '../../lib/jobStatus';
import { buildTimeline } from '../../lib/jobTimeline';
import { formatUKDateTime } from '../../lib/dates';
import type { Job, Jobsheet, JobStatus, Site, Customer, JobLine, Remedial, AuditLog } from '../../types';
import type { TemplateDef } from '../../templates/types';

const TABS = [
  { id: 'details',  label: 'Details'  },
  { id: 'jobsheet', label: 'Jobsheet' },
  { id: 'remedials',label: 'Remedials'},
  { id: 'lines',    label: 'Lines'    },
  { id: 'history',  label: 'History'  },
];

const JOB_TYPE_LABELS: Record<string, string> = {
  reactive_callout: 'Reactive Callout',
  ppm_service:      'PPM Service',
  install:          'Install',
  remedial_works:   'Remedial Works',
  survey:           'Survey',
};

const REMEDIAL_PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent:      { bg: 'bg-red-100',    text: 'text-red-700'    },
  recommended: { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  advisory:    { bg: 'bg-blue-100',   text: 'text-blue-700'   },
};

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { company } = useAuth();
  const { profiles: engineers } = useProfiles({ role: 'engineer' });
  const { profiles: everyone } = useProfiles();

  const activeTab = useActiveTab('tab', 'details');

  const [job, setJob]           = useState<Job | null>(null);
  const [site, setSite]         = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Jobsheet tab
  const [jobsheet, setJobsheet]   = useState<Jobsheet | null>(null);
  const [template, setTemplate]   = useState<TemplateDef | null>(null);
  const [jsLoading, setJsLoading] = useState(false);
  const [pdfBusy, setPdfBusy]     = useState<'open' | 'regenerate' | null>(null);
  const [pdfError, setPdfError]   = useState<string | null>(null);
  const isOnline = useOnline();

  // Remedials tab
  const [remedials, setRemedials]   = useState<Remedial[]>([]);
  const [remLoading, setRemLoading] = useState(false);

  // Lines tab
  const [lines, setLines]       = useState<JobLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // Engineer reassign
  const [reassigning, setReassigning] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  // History tab (audit_log is manager-readable and online only)
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [auditOffline, setAuditOffline] = useState(false);

  // ── Load job, site, customer ────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    setIsLoading(true);

    async function load() {
      try {
        const j = await fetchOneCached<Job>('jobs', jobId!);
        if (!j) return;
        setJob(j);
        const s = await fetchOneCached<Site>('sites', j.site_id);
        setSite(s);
        if (s) setCustomer(await fetchOneCached<Customer>('customers', s.customer_id));
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [jobId]);

  // ── Load jobsheet + template when tab is active ────────────────────────────
  useEffect(() => {
    if (activeTab !== 'jobsheet' || !jobId) return;
    setJsLoading(true);

    async function loadJobsheet() {
      try {
        // Server first: the PDF path is set after submission, by the engineer's device
        const js = (await fetchCached<Jobsheet>({ table: 'jobsheets', eq: { job_id: jobId! } })).rows[0];
        if (!js) { setJsLoading(false); return; }
        setJobsheet(js);

        const mod = await import(`../../templates/${js.template_id}.json`);
        setTemplate(mod.default as TemplateDef);
      } finally {
        setJsLoading(false);
      }
    }

    loadJobsheet();
  }, [activeTab, jobId]);

  // ── Load remedials when tab is active ─────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'remedials' || !jobId) return;
    setRemLoading(true);

    async function loadRemedials() {
      try {
        // Need jobsheet id first
        const js = jobsheet ?? (await fetchCached<Jobsheet>({ table: 'jobsheets', eq: { job_id: jobId! } })).rows[0];
        if (!js) { setRemLoading(false); return; }

        const { rows } = await fetchCached<Remedial>({ table: 'remedials', eq: { jobsheet_id: js.id } });
        setRemedials(rows);
      } finally {
        setRemLoading(false);
      }
    }

    loadRemedials();
  }, [activeTab, jobId, jobsheet]);

  // ── Load job lines when tab is active ────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'lines' || !jobId) return;
    setLinesLoading(true);

    async function loadLines() {
      try {
        const { rows } = await fetchCached<JobLine>({ table: 'job_lines', eq: { job_id: jobId! }, order: { column: 'sort_order' } });
        setLines(rows);
      } finally {
        setLinesLoading(false);
      }
    }

    loadLines();
  }, [activeTab, jobId]);

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'history' || !job) return;
    let cancelled = false;
    (async () => {
      const js = jobsheet ?? (await fetchCached<Jobsheet>({ table: 'jobsheets', eq: { job_id: job.id } })).rows[0] ?? null;
      if (js && !jobsheet) setJobsheet(js);
      const ids = [job.id, ...(js ? [js.id] : [])];
      const { data, error } = await supabase.from('audit_log').select('*').in('entity_id', ids);
      if (cancelled) return;
      setAudit(error ? [] : (data ?? []) as AuditLog[]);
      setAuditOffline(!!error);
    })();
    return () => { cancelled = true; };
  }, [activeTab, job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Engineer reassign ─────────────────────────────────────────────────────
  // Assigning schedules an unassigned job; unassigning a scheduled job un-schedules it.
  async function handleReassign(engineerId: string) {
    if (!job) return;
    setReassigning(true);
    const newVal = engineerId || null;
    const status = statusAfterAssign(job.status, newVal);
    setJob({ ...job, assigned_engineer_id: newVal, status });
    await writeRecord('jobs', 'update', { id: job.id, assigned_engineer_id: newVal, ...(status !== job.status ? { status } : {}) });
    setReassigning(false);
  }

  // ── Review / cancel ───────────────────────────────────────────────────────
  async function setStatus(status: JobStatus) {
    if (!job) return;
    if (status === 'cancelled' && !window.confirm('Cancel this job? The engineer will no longer see it as active.')) return;
    setStatusBusy(true);
    const before = job;
    setJob({ ...job, status });
    const res = await writeRecord('jobs', 'update', { id: job.id, status });
    if (res.status === 'failed') setJob(before);
    setStatusBusy(false);
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  async function openPdf() {
    if (!jobsheet?.pdf_path) return;
    setPdfBusy('open');
    setPdfError(null);
    try {
      await openStorageFile('pdfs', jobsheet.pdf_path);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
    } finally {
      setPdfBusy(null);
    }
  }

  async function regeneratePdf() {
    if (!jobsheet) return;
    setPdfBusy('regenerate');
    setPdfError(null);
    try {
      const { generateAndUploadPDF } = await import('../../pdf/generatePDF');
      const path = await generateAndUploadPDF(jobsheet.id);
      setJobsheet({ ...jobsheet, pdf_path: path });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
    } finally {
      setPdfBusy(null);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  function formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <EmptyState heading="Job not found" description="This job could not be loaded." />
      </div>
    );
  }

  const assignedEngineerId = job.assigned_engineer_id ?? '';
  const canReassign = isPlannable(job.status);
  const actions = managerActions(job.status);

  return (
    <div className="min-h-screen bg-slate-50">
      <RecordHeader
        title={site?.address ?? job.id}
        subtitle={customer?.name}
        badge={<StatusPill status={job.status} />}
        onBack={() => navigate('/manager/jobs')}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {actions.includes('review') && (
              <button
                type="button"
                onClick={() => setStatus('reviewed')}
                disabled={statusBusy}
                className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                Mark reviewed
              </button>
            )}
            {actions.includes('invoice') && (
              <button
                type="button"
                onClick={() => navigate(`/manager/invoices/create?job=${job.id}`)}
                className="rounded-lg bg-[#0D3349] text-white px-3 py-1.5 text-xs font-medium"
              >
                Create invoice
              </button>
            )}
            {actions.includes('cancel') && (
              <button
                type="button"
                onClick={() => setStatus('cancelled')}
                disabled={statusBusy}
                className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                Cancel job
              </button>
            )}
            <label className="text-xs text-slate-500 sr-only">Reassign</label>
            <select
              value={assignedEngineerId}
              onChange={e => handleReassign(e.target.value)}
              disabled={reassigning || !canReassign}
              title={canReassign ? undefined : 'Started or closed jobs can’t be reassigned'}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0D3349]"
              aria-label="Reassign engineer"
            >
              <option value="">— Unassigned —</option>
              {engineers.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        }
      />

      <Tabs tabs={TABS} paramName="tab" defaultTab="details" />

      <div className="p-4">
        {/* ── Details tab ──────────────────────────────────────────────── */}
        {activeTab === 'details' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            <DetailRow label="Type"           value={JOB_TYPE_LABELS[job.type] ?? job.type} />
            <DetailRow label="Template"       value={job.template_id.replace(/_/g, ' ')} />
            <DetailRow label="Scheduled Date" value={formatDate(job.scheduled_date)} />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm text-slate-500 w-36 shrink-0">Engineer</span>
              <select
                value={assignedEngineerId}
                onChange={e => handleReassign(e.target.value)}
                disabled={reassigning || !canReassign}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0D3349]"
              >
                <option value="">— Unassigned —</option>
                {engineers.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
            <DetailRow label="Notes" value={job.notes ?? '—'} />
            {job.travelling_at  && <DetailRow label="Travelling at"  value={formatDate(job.travelling_at)} />}
            {job.on_site_at     && <DetailRow label="On site at"     value={formatDate(job.on_site_at)} />}
            {job.completed_at   && <DetailRow label="Completed at"   value={formatDate(job.completed_at)} />}
          </div>
        )}

        {/* ── Jobsheet tab ─────────────────────────────────────────────── */}
        {activeTab === 'jobsheet' && (
          jsLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !jobsheet || !jobsheet.submitted_at ? (
            <EmptyState heading="No jobsheet submitted" description="The engineer has not yet submitted a jobsheet for this job." />
          ) : !template ? (
            <EmptyState heading="Template unavailable" description="Could not load the form template." />
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                {jobsheet.pdf_path ? (
                  <button
                    type="button"
                    onClick={openPdf}
                    disabled={pdfBusy !== null || !isOnline}
                    className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
                  >
                    {pdfBusy === 'open' ? 'Opening…' : 'View PDF'}
                  </button>
                ) : (
                  <span className="text-xs text-gray-500 italic">No PDF yet. It's made once the engineer's device has synced.</span>
                )}
                <button
                  type="button"
                  onClick={regeneratePdf}
                  disabled={pdfBusy !== null || !isOnline}
                  className="ml-auto border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
                >
                  {pdfBusy === 'regenerate' ? 'Generating…' : jobsheet.pdf_path ? 'Regenerate PDF' : 'Generate PDF'}
                </button>
                {!isOnline && <p className="w-full text-xs text-gray-500">PDFs need a connection.</p>}
                {pdfError && <p className="w-full text-xs text-red-600" role="alert">{pdfError}</p>}
              </div>
              <FormEngine
                template={template}
                jobsheetId={jobsheet.id}
                companyId={company?.id ?? jobsheet.company_id}
                readOnly={true}
              />
            </div>
          )
        )}

        {/* ── Remedials tab ────────────────────────────────────────────── */}
        {activeTab === 'remedials' && (
          remLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : remedials.length === 0 ? (
            <EmptyState heading="No remedials" description="No remedials have been raised for this job." />
          ) : (
            <div className="space-y-3">
              {remedials.map(rem => {
                const colors = REMEDIAL_PRIORITY_COLORS[rem.priority] ?? { bg: 'bg-slate-100', text: 'text-slate-700' };
                return (
                  <div key={rem.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-800">{rem.description}</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize shrink-0 ${colors.bg} ${colors.text}`}>
                        {rem.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 capitalize">Status: {rem.status}</p>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── Lines tab ────────────────────────────────────────────────── */}
        {activeTab === 'lines' && (
          linesLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : lines.length === 0 ? (
            <EmptyState heading="No parts or labour recorded" description="No job lines have been added to this job." />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map(line => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 capitalize text-slate-600">{line.line_type}</td>
                      <td className="px-4 py-3 text-slate-800">{line.description}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{line.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(line.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {formatCurrency(line.quantity * line.unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-slate-700 text-right">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {formatCurrency(lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {/* ── History tab ──────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            {auditOffline && (
              <p className="text-xs text-amber-700 mb-3">Offline: showing what this device knows. Names and later changes appear when you're back online.</p>
            )}
            <ol className="relative border-l border-slate-200 ml-2 space-y-4" data-testid="job-timeline">
              {buildTimeline(job, jobsheet, audit, everyone).map((e, i) => (
                <li key={`${e.key}-${i}`} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-slate-300 border-2 border-white" />
                  <p className="text-sm font-medium text-slate-800">{e.label}</p>
                  <p className="text-xs text-slate-500">
                    {formatUKDateTime(e.at)}{e.by && ` · ${e.by}`}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helper component ───────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="text-sm text-slate-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}
