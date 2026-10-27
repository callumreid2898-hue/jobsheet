import type { Job, Site } from '../types';
import { StatusPill } from './ui/StatusPill';
import { Badge } from './ui/Badge';

interface Props { job: Job; site: Site; onClick?: () => void; }

const templateLabels: Record<string, string> = {
  fire_alarm_service: 'Fire Alarm',
  reactive_callout: 'Reactive',
  emergency_lighting_test: 'Em. Lighting',
  cctv_maintenance: 'CCTV',
};

export function JobCard({ job, site, onClick }: Props) {
  return (
    <div
      className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer active:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-gray-900 text-sm leading-snug flex-1">{site.name}</p>
        <StatusPill status={job.status} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge label={templateLabels[job.template_id] ?? job.template_id} color="blue" />
        <Badge label={job.type} color="gray" />
        <span className="text-xs text-gray-400">{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  );
}
