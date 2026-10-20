import { useCachedQuery } from './useCachedQuery';
import type { Remedial } from '../types';

/** The Remedials badge in the manager sidebar: open urgent remedials. */
export function useNotificationCount(enabled = true): number {
  const { rows } = useCachedQuery<Remedial>(
    { table: 'remedials', eq: { status: 'open', priority: 'urgent' } },
    { enabled },
  );
  return rows.length;
}
