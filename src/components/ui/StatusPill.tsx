import type { JobStatus, InvoiceStatus } from '../../types';
import { jobStatusColors, invoiceStatusColors } from './statusColors';

interface StatusPillProps {
  status: JobStatus | InvoiceStatus;
  kind?: 'job' | 'invoice';
}

export function StatusPill({ status, kind = 'job' }: StatusPillProps) {
  const map = kind === 'invoice' ? invoiceStatusColors : jobStatusColors;
  const config = (map as Record<string, { label: string; bgClass: string; textClass: string }>)[status];
  if (!config) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}>
      {config.label}
    </span>
  );
}
