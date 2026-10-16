import { useMemo } from 'react';
import { useJobs } from './useJobs';
import { useRemedials } from './useRemedials';
import { useContracts } from './useContracts';
import { useInvoices } from './useInvoices';
import { useSites } from './useSites';
import { jobStatusColors } from '../components/ui/statusColors';
import type { JobStatus } from '../types';

export interface JobsByStatusSlice {
  status: JobStatus;
  label: string;
  count: number;
  fill: string;
}

export interface JobsPerDay {
  date: string;   // 'dd/MM'
  count: number;
}

export interface RemedialPrioritySlice {
  priority: 'urgent' | 'recommended' | 'advisory';
  count: number;
  fill: string;
}

export interface UpcomingVisit {
  contractId: string;
  siteId: string;
  siteAddress: string;
  systemType: string;
  nextDue: string; // ISO date
}

export interface DashboardStats {
  // KPI tiles
  unassignedJobs: number;
  scheduledToday: number;
  awaitingReview: number;
  openRemedials: number;
  urgentRemedials: number;
  activeContracts: number;
  overdueInvoices: number;
  draftInvoices: number;

  // Chart data
  jobsByStatus: JobsByStatusSlice[];
  jobsLast30Days: JobsPerDay[];
  remedialsByPriority: RemedialPrioritySlice[];
  upcomingVisits: UpcomingVisit[];

  isLoading: boolean;
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  fire_alarm:         'Fire Alarm',
  emergency_lighting: 'Emergency Lighting',
  cctv:               'CCTV',
  intruder:           'Intruder',
  access_control:     'Access Control',
};

export function useDashboardStats(): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);

  const { jobs, isLoading: jobsLoading } = useJobs();
  const { remedials, isLoading: remedialsLoading } = useRemedials();
  const { contracts, isLoading: contractsLoading } = useContracts();
  const { invoices, isLoading: invoicesLoading } = useInvoices();
  const { sites, isLoading: sitesLoading } = useSites();

  const stats = useMemo(() => {
    // ── KPI tiles ────────────────────────────────────────────
    const unassignedJobs    = jobs.filter(j => j.assigned_engineer_id === null).length;
    const scheduledToday    = jobs.filter(j => j.scheduled_date === today).length;
    const awaitingReview    = jobs.filter(j => j.status === 'awaiting_review').length;
    const openRemedials     = remedials.filter(r => r.status === 'open').length;
    const urgentRemedials   = remedials.filter(r => r.priority === 'urgent' && r.status === 'open').length;
    const activeContracts   = contracts.filter(c => c.status === 'active').length;
    const overdueInvoices   = invoices.filter(i => i.status === 'overdue').length;
    const draftInvoices     = invoices.filter(i => i.status === 'draft').length;

    // ── Jobs by status (donut) ────────────────────────────────
    const statusCounts: Partial<Record<JobStatus, number>> = {};
    for (const j of jobs) {
      statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
    }
    const jobsByStatus: JobsByStatusSlice[] = (Object.entries(statusCounts) as [JobStatus, number][])
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        status,
        label: jobStatusColors[status]?.label ?? status,
        count,
        fill: jobStatusColors[status]?.hex ?? '#94A3B8',
      }))
      .sort((a, b) => b.count - a.count);

    // ── Jobs per day — last 30 days (bar chart) ───────────────
    const days30: JobsPerDay[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso  = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const count = jobs.filter(j => j.scheduled_date === iso).length;
      days30.push({ date: label, count });
    }
    // Only keep the last 14 days for readability
    const jobsLast30Days = days30.slice(-14);

    // ── Remedials by priority ─────────────────────────────────
    const openRems = remedials.filter(r => r.status === 'open');
    const remedialsByPriority: RemedialPrioritySlice[] = (
      [
        { priority: 'urgent'      as const, count: openRems.filter(r => r.priority === 'urgent').length,      fill: '#EF4444' },
        { priority: 'recommended' as const, count: openRems.filter(r => r.priority === 'recommended').length, fill: '#F97316' },
        { priority: 'advisory'    as const, count: openRems.filter(r => r.priority === 'advisory').length,    fill: '#EAB308' },
      ] satisfies RemedialPrioritySlice[]
    ).filter(s => s.count > 0);

    // ── Upcoming PPM visits (next 90 days) ────────────────────
    const siteMap = new Map(sites.map(s => [s.id, s.address]));
    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() + 90);
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    const upcomingVisits: UpcomingVisit[] = contracts
      .filter(c => c.status === 'active' && c.next_visit_due && c.next_visit_due <= cutoffISO)
      .sort((a, b) => (a.next_visit_due ?? '').localeCompare(b.next_visit_due ?? ''))
      .slice(0, 8)
      .map(c => ({
        contractId:  c.id,
        siteId:      c.site_id,
        siteAddress: siteMap.get(c.site_id) ?? '—',
        systemType:  SYSTEM_TYPE_LABELS[c.system_type] ?? c.system_type,
        nextDue:     c.next_visit_due!,
      }));

    return {
      unassignedJobs, scheduledToday, awaitingReview,
      openRemedials, urgentRemedials, activeContracts,
      overdueInvoices, draftInvoices,
      jobsByStatus, jobsLast30Days, remedialsByPriority, upcomingVisits,
    };
  }, [jobs, remedials, contracts, invoices, sites, today]);

  const isLoading = jobsLoading || remedialsLoading || contractsLoading || invoicesLoading || sitesLoading;

  return { ...stats, isLoading };
}
