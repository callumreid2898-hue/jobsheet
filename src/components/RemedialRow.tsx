import type { Remedial, Site, RemedialStatus } from '../types';
import { FEATURES } from '../lib/features';
import { Badge } from './ui/Badge';

interface Props { remedial: Remedial; site: Site; onStatusChange?: (status: RemedialStatus) => void; }

const priorityColors: Record<string, 'red' | 'orange' | 'yellow'> = {
  urgent: 'red', recommended: 'orange', advisory: 'yellow',
};

export function RemedialRow({ remedial, site, onStatusChange }: Props) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-2 mb-2">
        <Badge label={remedial.priority} color={priorityColors[remedial.priority] ?? 'gray'} />
        <p className="text-sm text-gray-800 flex-1">{remedial.description}</p>
      </div>
      <p className="text-xs text-gray-500 mb-2">{site.name}</p>
      {onStatusChange ? (
        <select
          value={remedial.status}
          onChange={e => onStatusChange(e.target.value as RemedialStatus)}
          className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white"
        >
          <option value="open">Open</option>
          {(FEATURES.quotes || remedial.status === 'quoted') && <option value="quoted">Quoted</option>}
          <option value="done">Done</option>
        </select>
      ) : (
        <span className="text-xs text-gray-500 capitalize">{remedial.status}</span>
      )}
    </div>
  );
}
