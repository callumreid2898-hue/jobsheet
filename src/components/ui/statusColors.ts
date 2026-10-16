import type { JobStatus, InvoiceStatus } from '../../types';

export interface StatusColor {
  label: string;
  hex: string;
  bgClass: string;
  textClass: string;
}

export const jobStatusColors: Record<JobStatus, StatusColor> = {
  unassigned:      { label: 'Unassigned',      hex: '#94A3B8', bgClass: 'bg-slate-100',   textClass: 'text-slate-600'   },
  scheduled:       { label: 'Scheduled',       hex: '#3B82F6', bgClass: 'bg-blue-100',    textClass: 'text-blue-700'    },
  travelling:      { label: 'Travelling',      hex: '#F59E0B', bgClass: 'bg-amber-100',   textClass: 'text-amber-700'   },
  on_site:         { label: 'On Site',         hex: '#10B981', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' },
  completed:       { label: 'Completed',       hex: '#22C55E', bgClass: 'bg-green-100',   textClass: 'text-green-700'   },
  awaiting_review: { label: 'Awaiting Review', hex: '#F97316', bgClass: 'bg-orange-100',  textClass: 'text-orange-700'  },
  reviewed:        { label: 'Reviewed',        hex: '#8B5CF6', bgClass: 'bg-violet-100',  textClass: 'text-violet-700'  },
  invoiced:        { label: 'Invoiced',        hex: '#0891B2', bgClass: 'bg-cyan-100',    textClass: 'text-cyan-700'    },
  cancelled:       { label: 'Cancelled',       hex: '#EF4444', bgClass: 'bg-red-100',     textClass: 'text-red-700'     },
};

export const invoiceStatusColors: Record<InvoiceStatus, StatusColor> = {
  draft:   { label: 'Draft',   hex: '#94A3B8', bgClass: 'bg-slate-100',  textClass: 'text-slate-600'  },
  sent:    { label: 'Sent',    hex: '#3B82F6', bgClass: 'bg-blue-100',   textClass: 'text-blue-700'   },
  paid:    { label: 'Paid',    hex: '#22C55E', bgClass: 'bg-green-100',  textClass: 'text-green-700'  },
  overdue: { label: 'Overdue', hex: '#EF4444', bgClass: 'bg-red-100',    textClass: 'text-red-700'    },
  void:    { label: 'Void',    hex: '#CBD5E1', bgClass: 'bg-slate-100',  textClass: 'text-slate-500'  },
};
