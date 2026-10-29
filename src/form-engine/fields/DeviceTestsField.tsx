import { useEffect, useState } from 'react';
import type { FieldDef } from '../../templates/types';
import type { Device, DeviceTestAnswers, DeviceTestResult, FieldAnswer } from '../../types';
import { fetchCached } from '../../lib/cachedQuery';
import { deviceLabel, DEVICE_TEST_LABELS } from '../../lib/devices';
import { useFormMedia } from '../FormContext';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

const RESULTS: DeviceTestResult[] = ['pass', 'fail', 'not_tested'];

const selectedClass: Record<DeviceTestResult, string> = {
  pass: 'bg-green-500 text-white border-green-500',
  fail: 'bg-red-500 text-white border-red-500',
  not_tested: 'bg-gray-500 text-white border-gray-500',
};

/**
 * The site's registered devices (those on the job's system, or on no system), each
 * marked pass / fail / not tested. Saved to device_tests when the jobsheet is submitted.
 */
export function DeviceTestsField({ field, value, onChange, readOnly, error }: Props) {
  const { siteId, systemId } = useFormMedia();
  const current = (value as DeviceTestAnswers | null) ?? {};
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!siteId || readOnly) return;
    let cancelled = false;
    fetchCached<Device>({ table: 'devices', eq: { site_id: siteId }, order: { column: 'location' } }).then(({ rows, fromCache }) => {
      if (cancelled) return;
      setOffline(fromCache);
      setDevices(rows.filter(d => d.status !== 'removed' && (!systemId || !d.system_id || d.system_id === systemId)));
    });
    return () => { cancelled = true; };
  }, [siteId, systemId, readOnly]);

  // A submitted sheet shows what was recorded, even if the register has changed since
  const rows = readOnly || !devices
    ? Object.entries(current).map(([id, e]) => ({ id, label: e.label }))
    : devices.map(d => ({ id: d.id, label: deviceLabel(d) }));
  const recorded = rows.filter(r => current[r.id]?.result).length;

  function update(id: string, label: string, patch: Partial<DeviceTestAnswers[string]>) {
    const prev = current[id] ?? { result: null, note: '', label };
    onChange({ ...current, [id]: { ...prev, label, ...patch } });
  }

  function passRemaining() {
    const next = { ...current };
    for (const r of rows) {
      if (!next[r.id]?.result) next[r.id] = { result: 'pass', note: next[r.id]?.note ?? '', label: r.label };
    }
    onChange(next);
  }

  return (
    <div className="px-4 py-3" data-error={!!error} data-testid={`device-tests-${field.id}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <label className="block text-sm font-medium text-gray-700">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {rows.length > 0 && <span className="text-xs text-gray-500 shrink-0">{recorded} of {rows.length} recorded</span>}
      </div>
      {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}

      {!readOnly && devices === null && <p className="text-sm text-gray-400">Loading devices…</p>}
      {rows.length === 0 && (readOnly || devices !== null) && (
        <p className="text-sm text-gray-500">
          {readOnly ? 'No devices recorded.'
            : offline ? "You're offline and no devices for this site are saved on this phone. Reopen the sheet with a connection to test them."
            : "No devices are registered for this site. The office can add them on the site's Devices tab."}
        </p>
      )}

      {!readOnly && rows.length > 0 && recorded < rows.length && (
        <button
          type="button"
          onClick={passRemaining}
          className="mb-3 text-sm font-medium text-blue-600"
        >
          Pass all not yet recorded ({rows.length - recorded})
        </button>
      )}

      <ul className="space-y-3">
        {rows.map(r => {
          const entry = current[r.id];
          return (
            <li key={r.id} className="border border-gray-200 rounded-lg p-3" data-testid="device-test-row">
              <p className="text-sm font-medium text-gray-900 mb-2">{r.label}</p>
              <div className="flex gap-2" role="group" aria-label={r.label}>
                {RESULTS.map(result => (
                  <button
                    key={result}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={entry?.result === result}
                    onClick={() => update(r.id, r.label, { result: entry?.result === result ? null : result })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border min-h-[44px] ${
                      entry?.result === result ? selectedClass[result] : 'bg-white text-gray-700 border-gray-300'
                    } ${readOnly ? 'opacity-75 cursor-default' : ''}`}
                  >
                    {DEVICE_TEST_LABELS[result]}
                  </button>
                ))}
              </div>
              {(entry?.result === 'fail' || entry?.note) && (
                <textarea
                  value={entry?.note ?? ''}
                  onChange={e => update(r.id, r.label, { note: e.target.value })}
                  readOnly={readOnly}
                  disabled={readOnly}
                  rows={2}
                  aria-label={`Note for ${r.label}`}
                  placeholder={entry?.result === 'fail' ? 'Describe the fault (required)' : 'Note'}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
