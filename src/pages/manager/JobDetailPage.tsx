import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { useProfiles } from '../../hooks/useProfiles';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormEngine } from '../../form-engine/FormEngine';
import { enqueueSync } from '../../offline/SyncQueue';
import type { Job, Jobsheet, Site, Customer, JobLine, Remedial } from '../../types';
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

  const activeTab = useActiveTab('tab', 'details');

  const [job, setJob]           = useState<Job | null>(null);
  const [site, setSite]         = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Jobsheet tab
  const [jobsheet, setJobsheet]   = useState<Jobsheet | null>(null);
  const [template, setTemplate]   = useState<TemplateDef | null>(null);
  const [jsLoading, setJsLoading] = useState(false);

  // Remedials tab
  const [remedials, setRemedials]   = useState<Remedial[]>([]);
  const [remLoading, setRemLoading] = useState(false);

  // Lines tab
  const [lines, setLines]       = useState<JobLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // Engineer reassign
  const [reassigning, setReassigning] = useState(false);

  // ── Load job, site, customer ────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    setIsLoading(true);

    async function load() {
      try {
        // Job
        let j: Job | undefined;
        const dexieJob = await db.jobs.get(jobId!).catch(() => undefined);
        if (dexieJob) {
          j = dexieJob;
        } else {
          const { data } = await supabase.from('jobs').select('*').eq('id', jobId!).single();
          if (data) { j = data as Job; await db.jobs.put(j).catch(() => {}); }
        }
        if (!j) { setIsLoading(false); return; }
        setJob(j);

        // Site
        let s: Site | undefined;
        const dexieSite = await db.sites.get(j.site_id).catch(() => undefined);
        if (dexieSite) {
          s = dexieSite;
        } else {
          const { data } = await supabase.from('sites').select('*').eq('id', j.site_id).single();
          if (data) { s = data as Site; await db.sites.put(s).catch(() => {}); }
        }
        if (s) setSite(s);

        // Customer
        if (s) {
          let c: Customer | undefined;
          const dexieCust = await db.customers.get(s.customer_id).catch(() => undefined);
          if (dexieCust) {
            c = dexieCust;
          } else {
            const { data } = await supabase.from('customers').select('*').eq('id', s.customer_id).single();
            if (data) { c = data as Customer; await db.customers.put(c).catch(() => {}); }
          }
          if (c) setCustomer(c);
        }
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
        let js: Jobsheet | undefined;
        const dexieJs = await db.jobsheets.where('job_id').equals(jobId!).first().catch(() => undefined);
        if (dexieJs) {
          js = dexieJs;
        } else {
          const { data } = await supabase.from('jobsheets').select('*').eq('job_id', jobId!).maybeSingle();
          if (data) { js = data as Jobsheet; await db.jobsheets.put(js).catch(() => {}); }
        }
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
        const js = jobsheet ?? await db.jobsheets.where('job_id').equals(jobId!).first().catch(() => undefined);
        if (!js) { setRemLoading(false); return; }

        let rems: Remedial[] = [];
        try {
          const { data } = await supabase.from('remedials').select('*').eq('jobsheet_id', js.id);
          if (data) {
            rems = data as Remedial[];
            await db.remedials.bulkPut(rems).catch(() => {});
          }
        } catch {
          rems = await db.remedials.where('jobsheet_id').equals(js.id).toArray().catch(() => []);
        }
        setRemedials(rems);
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
        let jls: JobLine[] = [];
        try {
          const { data } = await supabase.from('job_lines').select('*').eq('job_id', jobId!).order('sort_order');
          if (data) {
            jls = data as JobLine[];
            await db.job_lines.bulkPut(jls).catch(() => {});
          }
        } catch {
          jls = await db.job_lines.where('job_id').equals(jobId!).toArray().catch(() => []);
          jls.sort((a, b) => a.sort_order - b.sort_order);
        }
        setLines(jls);
      } finally {
        setLinesLoading(false);
      }
    }

    loadLines();
  }, [activeTab, jobId]);

  // ── Engineer reassign ─────────────────────────────────────────────────────
  async function handleReassign(engineerId: string) {
    if (!job) return;
    setReassigning(true);
    const newVal = engineerId || null;
    const updated: Job = { ...job, assigned_engineer_id: newVal };
    setJob(updated);
    await db.jobs.put(updated).catch(() => {});
    await enqueueSync({ table: 'jobs', operation: 'update', payload: { id: job.id, assigned_engineer_id: newVal } });
    try {
      await supabase.from('jobs').update({ assigned_engineer_id: newVal }).eq('id', job.id);
    } catch {
      // already enqueued
    }
    setReassigning(false);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <RecordHeader
        title={site?.address ?? job.id}
        subtitle={customer?.name}
        badge={<StatusPill status={job.status} />}
        onBack={() => navigate('/manager/jobs')}
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 sr-only">Reassign</label>
            <select
              value={assignedEngineerId}
              onChange={e => handleReassign(e.target.value)}
              disabled={reassigning}
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
                disabled={reassigning}
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
            <FormEngine
              template={template}
              jobsheetId={jobsheet.id}
              companyId={company?.id ?? jobsheet.company_id}
              readOnly={true}
            />
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
          <EmptyState heading="Audit log coming soon" description="A full history of changes to this job will appear here." />
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
