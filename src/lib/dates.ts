// Calendar dates (jobs.scheduled_date etc.) are 'YYYY-MM-DD' in UK local time.
// Never derive them from toISOString(), which is UTC and an hour behind during BST.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of `d` as 'YYYY-MM-DD'. */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds whole calendar days to a 'YYYY-MM-DD' date. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISODate(new Date(y, m - 1, d + days));
}

// Timestamps are shown in UK time whatever the device's zone (PDFs can be rendered anywhere).
const UK_TZ = 'Europe/London';

/** e.g. "20 Oct 2026, 14:05" */
export function formatUKDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: UK_TZ,
  });
}

/** e.g. "20/10/2026" */
export function formatUKDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: UK_TZ });
}

/** e.g. "14:05" */
export function formatUKTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: UK_TZ });
}
