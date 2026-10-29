import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { useRemedials } from '../../hooks/useRemedials';
import { useDevices, useDeviceTests } from '../../hooks/useDevices';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { DeviceRegister } from '../../components/DeviceRegister';
import type { System, RemedialPriority } from '../../types';
import { SYSTEM_TYPE_LABELS } from '../../lib/contracts';

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'devices',   label: 'Devices'   },
  { id: 'history',   label: 'History'   },
  { id: 'remedials', label: 'Remedials' },
];

const REMEDIAL_PRIORITY_CLASSES: Record<RemedialPriority, string> = {
  urgent:      'bg-red-100 text-red-700',
  recommended: 'bg-amber-100 text-amber-700',
  advisory:    'bg-yellow-100 text-yellow-700',
};

interface SystemField {
  label: string;
  value: string | null | undefined;
}

function getSystemFields(system: System): SystemField[] {
  return [
    { label: 'Type',           value: SYSTEM_TYPE_LABELS[system.type] ?? system.type },
    { label: 'Make',           value: system.make },
    { label: 'Model',          value: system.model },
    { label: 'Panel Location', value: system.panel_location },
    { label: 'Zones',          value: system.zones_count != null ? String(system.zones_count) : null },
    { label: 'Loops',          value: system.loops_count != null ? String(system.loops_count) : null },
    { label: 'Cameras',        value: system.num_cameras != null ? String(system.num_cameras) : null },
    { label: 'Retention',      value: system.retention_days != null ? `${system.retention_days} days` : null },
    { label: 'Grade',          value: system.grade },
  ];
}

export function SystemDetailPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const navigate = useNavigate();
  const activeTab = useActiveTab('tab', 'overview');

  const [system, setSystem] = useState<System | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { remedials: fetchedRemedials } = useRemedials({ siteId: system?.site_id });
  const { devices } = useDevices({ siteId: system?.site_id });
  // This system's devices, plus the site's devices not linked to any system
  const systemDevices = devices.filter(d => d.system_id === systemId || d.system_id === null);
  const { tests } = useDeviceTests(activeTab === 'devices' && systemDevices.length > 0);
  // Until the system loads the query has no site, so drop anything that isn't this site's
  const remedials = fetchedRemedials.filter(r => r.site_id === system?.site_id);

  useEffect(() => {
    if (!systemId) return;
    async function load() {
      setIsLoading(true);
      setSystem(await fetchOneCached<System>('systems', systemId!));
      setIsLoading(false);
    }
    load();
  }, [systemId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!system) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(-1)}
          className="text-[#0D3349] text-sm mb-4 inline-block hover:underline"
        >
          ‹ Back
        </button>
        <p className="text-center py-12 text-slate-400">System not found.</p>
      </div>
    );
  }

  const fields = getSystemFields(system);

  return (
    <div className="flex flex-col min-h-0">
      <RecordHeader
        title={SYSTEM_TYPE_LABELS[system.type] ?? system.type}
        subtitle={[system.make, system.model].filter(Boolean).join(' ') || undefined}
        onBack={() => navigate(`/manager/sites/${system.site_id}?tab=systems`)}
        backHref={`/manager/sites/${system.site_id}?tab=systems`}
        actions={
          <button
            onClick={() => navigate(`/manager/systems/${system.id}/edit`)}
            className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        }
      />

      <Tabs tabs={TABS} paramName="tab" defaultTab="overview" />

      <div className="p-4 sm:p-6">
        {/* ── Overview ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {fields
                .filter((f) => f.value != null && f.value !== '')
                .map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      {f.label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-slate-800">{f.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        {/* ── Devices ──────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <DeviceRegister
            devices={systemDevices}
            tests={tests}
            addHref={`/manager/sites/${system.site_id}/devices/add`}
            emptyText="No devices are linked to this system."
            showUnlinked
          />
        )}

        {/* ── History ──────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <EmptyState heading="Service history will be available soon" />
        )}

        {/* ── Remedials ────────────────────────────────────────── */}
        {activeTab === 'remedials' && (
          <>
            {remedials.length === 0 ? (
              <EmptyState
                heading="No remedials"
                description="No remedials have been raised for this system's site."
              />
            ) : (
              <ul className="space-y-2">
                {remedials.map((rem) => (
                  <li
                    key={rem.id}
                    className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-800 flex-1">{rem.description}</p>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${REMEDIAL_PRIORITY_CLASSES[rem.priority]}`}
                        >
                          {rem.priority}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                          {rem.status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
