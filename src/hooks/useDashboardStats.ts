import { useMemo } from 'react';
import { useJobs } from './useJobs';
import { useRemedials } from './useRemedials';
import { useContracts } from './useContracts';
import { useInvoices } from './useInvoices';

export interface DashboardStats {
  unassignedJobs: number;
  scheduledToday: number;
  awaitingReview: number;
  openRemedials: number;
  urgentRemedials: number;
  activeContracts: number;
  overdueInvoices: number;
  draftInvoices: number;
  isLoading: boolean;
}

export function useDashboardStats(): DashboardStats {
  const today = new Date().toISOString().slice(0, 10);

  const { jobs, isLoading: jobsLoading } = useJobs();
  const { remedials, isLoading: remedialsLoading } = useRemedials();
  const { contracts, isLoading: contractsLoading } = useContracts();
  const { invoices, isLoading: invoicesLoading } = useInvoices();

  const stats = useMemo(() => {
    const unassignedJobs = jobs.filter(j => j.assigned_engineer_id === null).length;
    const scheduledToday = jobs.filter(j => j.scheduled_date === today).length;
    const awaitingReview = jobs.filter(j => j.status === 'awaiting_review').length;
    const openRemedials = remedials.filter(r => r.status === 'open').length;
    const urgentRemedials = remedials.filter(r => r.priority === 'urgent' && r.status === 'open').length;
    const activeContracts = contracts.filter(c => c.status === 'active').length;
    const overdueInvoices = invoices.filter(i => i.status === 'overdue').length;
    const draftInvoices = invoices.filter(i => i.status === 'draft').length;

    return {
      unassignedJobs,
      scheduledToday,
      awaitingReview,
      openRemedials,
      urgentRemedials,
      activeContracts,
      overdueInvoices,
      draftInvoices,
    };
  }, [jobs, remedials, contracts, invoices, today]);

  const isLoading = jobsLoading || remedialsLoading || contractsLoading || invoicesLoading;

  return { ...stats, isLoading };
}
