import { useJobs } from './useJobs';
import { useInvoices } from './useInvoices';

/**
 * Returns total notification count = awaiting_review jobs + overdue invoices.
 */
export function useNotificationCount(): number {
  const { jobs } = useJobs();
  const { invoices } = useInvoices();

  const awaitingReview = jobs.filter(j => j.status === 'awaiting_review').length;
  const overdueInvoices = invoices.filter(i => i.status === 'overdue').length;

  return awaitingReview + overdueInvoices;
}
