import { useNavigate } from 'react-router-dom';
import { FEATURES } from '../../lib/features';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Spinner } from '../../components/ui/Spinner';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import type { JobsByStatusSlice, RemedialPrioritySlice, UpcomingVisit, JobsPerDay } from '../../hooks/useDashboardStats';

// ─── KPI Tile ────────────────────────────────────────────────

interface TileProps {
  dataTile: string;
  label: string;
  count: number;
  href: string;
  color: string;
  icon: React.ReactNode;
  isLoading: boolean;
}

function StatTile({ dataTile, label, count, href, color, icon, isLoading }: TileProps) {
  const navigate = useNavigate();
  return (
    <div
      data-tile={dataTile}
      onClick={() => navigate(href)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(href); }}
      className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-3"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '1A' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        {isLoading ? (
          <div className="h-6 w-8 bg-slate-100 rounded animate-pulse mb-1" />
        ) : (
          <div className="text-2xl font-bold leading-none" style={{ color }}>{count}</div>
        )}
        <div className="text-xs text-slate-500 leading-tight mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

// ─── Custom tooltip for donut ─────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <span className="font-semibold text-slate-800">{payload[0].name}</span>
      <span className="ml-2 text-slate-500">{payload[0].value} job{payload[0].value !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ─── Jobs by Status donut ─────────────────────────────────────

function JobsDonut({ data, isLoading }: { data: JobsByStatusSlice[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center items-center h-48"><Spinner /></div>;
  if (!data.length) return <p className="text-sm text-slate-400 text-center py-12">No jobs yet</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<DonutTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Jobs per day bar chart ───────────────────────────────────

function JobsBarChart({ data, isLoading }: { data: JobsPerDay[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center items-center h-48"><Spinner /></div>;
  const hasData = data.some(d => d.count > 0);
  if (!hasData) return <p className="text-sm text-slate-400 text-center py-12">No jobs scheduled in the last 14 days</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#94A3B8' }}
          tickLine={false}
          axisLine={false}
          interval={1}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: '#94A3B8' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
          cursor={{ fill: '#F8FAFC' }}
        />
        <Bar dataKey="count" name="Jobs" fill="#0D3349" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Remedials by priority ────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', recommended: 'Recommended', advisory: 'Advisory',
};

function RemedialsChart({ data, isLoading }: { data: RemedialPrioritySlice[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center items-center h-48"><Spinner /></div>;
  if (!data.length) return <p className="text-sm text-slate-400 text-center py-12">No open remedials</p>;

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-3 py-2">
      {data.map(({ priority, count, fill }) => (
        <div key={priority}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-600">{PRIORITY_LABELS[priority]}</span>
            <span className="text-xs font-semibold" style={{ color: fill }}>{count}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(count / total) * 100}%`, backgroundColor: fill }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400 pt-1">{total} open remedial{total !== 1 ? 's' : ''} total</p>
    </div>
  );
}

// ─── Upcoming PPM visits ──────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const DUE_COLOURS: Record<UpcomingVisit['dueState'], string> = {
  overdue: '#EF4444', due_today: '#EF4444', due_soon: '#F97316', scheduled: '#10B981', not_scheduled: '#94A3B8', inactive: '#94A3B8',
};

function UpcomingPPM({ visits, more, isLoading }: { visits: UpcomingVisit[]; more: number; isLoading: boolean }) {
  const navigate = useNavigate();
  if (isLoading) return <div className="flex justify-center items-center h-48"><Spinner /></div>;
  if (!visits.length) return <p className="text-sm text-slate-400 text-center py-12">No PPM visits overdue or due in the next 90 days</p>;

  return (
    <ul className="divide-y divide-slate-100">
      {visits.map((v) => {
        const urgentColor = DUE_COLOURS[v.dueState];
        return (
          <li key={v.contractId}>
            <button
              onClick={() => navigate(`/manager/contracts/${v.contractId}`)}
              className="w-full flex items-center justify-between py-2.5 text-left hover:bg-slate-50 transition-colors rounded-lg px-1"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{v.siteAddress}</p>
                <p className="text-xs text-slate-500">{v.systemType}</p>
              </div>
              <div className="shrink-0 text-right ml-3">
                <p className="text-xs font-semibold" style={{ color: urgentColor }}>{formatDate(v.nextDue)}</p>
                <p className="text-xs text-slate-400">{v.dueText}</p>
              </div>
            </button>
          </li>
        );
      })}
      {more > 0 && (
        <li className="pt-2 text-xs text-slate-500">
          <button onClick={() => navigate('/manager/reports')} className="hover:underline">+{more} more on the PPM report</button>
        </li>
      )}
    </ul>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────

export function DashboardPage() {
  const stats = useDashboardStats();

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const tiles = [
    { dataTile: 'unassigned-jobs',  label: 'Unassigned Jobs',  count: stats.unassignedJobs,  href: '/manager/jobs?status=unassigned',        color: '#94A3B8', icon: <IconBriefcase /> },
    { dataTile: 'scheduled-today',  label: 'Scheduled Today',  count: stats.scheduledToday,  href: '/manager/planner',                         color: '#3B82F6', icon: <IconCalendar /> },
    { dataTile: 'awaiting-review',  label: 'Awaiting Review',  count: stats.awaitingReview,  href: '/manager/jobs?status=awaiting_review',     color: '#F97316', icon: <IconClipboard /> },
    { dataTile: 'open-remedials',   label: 'Open Remedials',   count: stats.openRemedials,   href: '/manager/remedials',                       color: '#EF4444', icon: <IconAlert /> },
    { dataTile: 'urgent-remedials', label: 'Urgent Remedials', count: stats.urgentRemedials, href: '/manager/remedials?priority=urgent',       color: '#DC2626', icon: <IconFire /> },
    { dataTile: 'active-contracts', label: 'Active Contracts', count: stats.activeContracts, href: '/manager/contracts',                       color: '#10B981', icon: <IconShield /> },
    { dataTile: 'overdue-invoices', label: 'Overdue Invoices', count: stats.overdueInvoices, href: '/manager/invoices?status=overdue',         color: '#EF4444', icon: <IconReceipt />, feature: 'invoices' as const },
    { dataTile: 'draft-invoices',   label: 'Draft Invoices',   count: stats.draftInvoices,   href: '/manager/invoices?status=draft',           color: '#94A3B8', icon: <IconDraft />, feature: 'invoices' as const },
  ].filter(t => !('feature' in t && t.feature) || FEATURES[t.feature]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">{todayLabel}</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <StatTile key={tile.dataTile} {...tile} isLoading={stats.isLoading} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Jobs by Status">
          <JobsDonut data={stats.jobsByStatus} isLoading={stats.isLoading} />
        </Card>
        <Card title="Jobs Scheduled — Last 14 Days">
          <JobsBarChart data={stats.jobsLast30Days} isLoading={stats.isLoading} />
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Open Remedials by Priority">
          <RemedialsChart data={stats.remedialsByPriority} isLoading={stats.isLoading} />
        </Card>
        <Card title="Upcoming PPM Visits (90 days)">
          <UpcomingPPM visits={stats.upcomingVisits} more={stats.upcomingVisitsMore} isLoading={stats.isLoading} />
        </Card>
      </div>
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────

function IconBriefcase() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
}
function IconCalendar() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function IconClipboard() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
}
function IconAlert() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
}
function IconFire() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>;
}
function IconShield() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
}
function IconReceipt() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;
}
function IconDraft() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
}
