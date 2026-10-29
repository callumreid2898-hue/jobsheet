import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { coverage, deviceLabel, DEVICE_TEST_LABELS } from '../lib/devices';
import { formatUKDate } from '../lib/dates';
import { EmptyState } from './ui/EmptyState';
import type { Device, DeviceTest, DeviceTestResult } from '../types';

const resultChip: Record<DeviceTestResult, string> = {
  pass: 'bg-green-100 text-green-700',
  fail: 'bg-red-100 text-red-700',
  not_tested: 'bg-gray-100 text-gray-500',
};

interface Props {
  devices: Device[];
  tests: DeviceTest[];
  /** "Add device" goes here (managers) */
  addHref?: string;
  emptyText: string;
  /** Marks devices not linked to any system (on a system's page) */
  showUnlinked?: boolean;
}

/** Test coverage over the last 12 months, then each device with its latest result. */
export function DeviceRegister({ devices, tests, addHref, emptyText, showUnlinked }: Props) {
  const navigate = useNavigate();
  const cov = useMemo(() => coverage(devices, tests), [devices, tests]);
  const latest = useMemo(() => {
    const m = new Map<string, DeviceTest>();
    for (const t of tests) {
      const prev = m.get(t.device_id);
      if (!prev || t.tested_at > prev.tested_at) m.set(t.device_id, t);
    }
    return m;
  }, [tests]);
  const untested = useMemo(() => new Set(cov.untested.map(d => d.id)), [cov]);
  // Active first, then by location
  const sorted = [...devices].sort((a, b) =>
    Number(a.status === 'removed') - Number(b.status === 'removed') ||
    (a.location ?? '').localeCompare(b.location ?? ''));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4" data-testid="coverage">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tested in the last 12 months</p>
          {cov.percent === null ? (
            <p className="text-sm text-slate-500 mt-1">No devices registered</p>
          ) : (
            <>
              <p className="text-sm text-slate-800 mt-1">
                <span className="text-lg font-bold">{cov.percent}%</span>
                {' '}· {cov.tested} of {cov.total} devices
                {cov.failing > 0 && <span className="text-red-600"> · {cov.failing} failing</span>}
              </p>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${cov.percent === 100 ? 'bg-green-500' : cov.percent >= 75 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${cov.percent}%` }}
                />
              </div>
            </>
          )}
        </div>
        {addHref && (
          <button
            onClick={() => navigate(addHref)}
            className="shrink-0 bg-[#0D3349] text-white text-sm font-semibold px-3 py-2 rounded-lg"
          >
            + Add device
          </button>
        )}
      </div>

      {devices.length === 0 ? (
        <EmptyState heading="No devices" description={emptyText} />
      ) : (
        <ul className="space-y-2" data-testid="device-list">
          {sorted.map(d => {
            const last = latest.get(d.id);
            return (
              <li key={d.id}>
                <button
                  onClick={() => navigate(`/devices/${d.id}`)}
                  className={`w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:bg-slate-50 text-left ${d.status === 'removed' ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{deviceLabel(d)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[d.make, d.model].filter(Boolean).join(' ') || 'No make recorded'}
                      {showUnlinked && !d.system_id ? ' · not linked to a system' : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {d.status === 'removed' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Removed</span>
                    ) : last ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${resultChip[last.result]}`}>
                        {DEVICE_TEST_LABELS[last.result]} · {formatUKDate(last.tested_at)}
                      </span>
                    ) : null}
                    {d.status !== 'removed' && untested.has(d.id) && (
                      <span className="text-xs text-amber-600">Due: not tested in 12 months</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
