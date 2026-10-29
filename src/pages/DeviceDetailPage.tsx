import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchCached, fetchOneCached } from '../lib/cachedQuery';
import { writeRecord } from '../lib/writeRecord';
import { formatUKDateTime } from '../lib/dates';
import { DEVICE_TEST_LABELS, formatDeviceType } from '../lib/devices';
import { SYSTEM_TYPE_LABELS } from '../lib/contracts';
import { useAuth } from '../auth/AuthProvider';
import { Spinner } from '../components/ui/Spinner';
import type { Device, DeviceTest, DeviceTestResult, Site, System } from '../types';

const resultChip: Record<DeviceTestResult, string> = {
  pass:       'bg-green-100 text-green-700',
  fail:       'bg-red-100 text-red-700',
  not_tested: 'bg-gray-100 text-gray-500',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-400 w-28 shrink-0">{label}</dt>
      <dd className="text-gray-800 min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** One device and its test history, for managers and engineers (the scanner opens it). */
export function DeviceDetailPage() {
  const navigate = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { profile, previewRole } = useAuth();
  const isManager = (previewRole ?? profile?.role) === 'manager';
  const [device, setDevice] = useState<Device | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const [tests, setTests] = useState<DeviceTest[]>([]);
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingTests, setLoadingTests] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testResult, setTestResult] = useState<DeviceTestResult>('pass');
  const [testNote, setTestNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      setLoadingDevice(true);
      const d = await fetchOneCached<Device>('devices', deviceId);
      const [s, sys] = await Promise.all([
        d ? fetchOneCached<Site>('sites', d.site_id) : null,
        d?.system_id ? fetchOneCached<System>('systems', d.system_id) : null,
      ]);
      if (cancelled) return;
      setDevice(d);
      setSite(s);
      setSystem(sys);
      setLoadingDevice(false);
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  async function loadTests() {
    if (!deviceId) return;
    setLoadingTests(true);
    const { rows } = await fetchCached<DeviceTest>({
      table: 'device_tests', eq: { device_id: deviceId }, order: { column: 'tested_at', ascending: false },
    });
    setTests(rows);
    setLoadingTests(false);
  }

  useEffect(() => { loadTests(); }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveTest(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !deviceId) return;
    if (testResult === 'fail' && !testNote.trim()) return;
    setSaving(true);
    const test: DeviceTest = {
      id: crypto.randomUUID(),
      device_id: deviceId,
      jobsheet_id: null,
      company_id: profile.company_id,
      result: testResult,
      note: testNote.trim() || null,
      tested_at: new Date().toISOString(),
    };
    await writeRecord('device_tests', 'insert', { ...test });
    setSaving(false);
    setShowForm(false);
    setTestResult('pass');
    setTestNote('');
    await loadTests();
  }

  // Back to wherever the device was opened from (scanner, site, jobsheet), else a sensible home
  function goBack() {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate(isManager && device ? `/manager/sites/${device.site_id}?tab=devices` : '/jobs');
  }

  if (loadingDevice) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (!device) {
    return (
      <div className="px-4 pt-6 pb-6">
        <button onClick={goBack} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
        <p className="text-center text-gray-400 py-12">Device not found</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-6 max-w-2xl">
      <button onClick={goBack} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>

      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h1 className="text-xl font-bold text-gray-900">{formatDeviceType(device.type)}</h1>
          {device.status === 'removed' && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Removed</span>
          )}
        </div>
        <dl className="space-y-2 text-sm">
          {site && (
            <Row label="Site">
              {isManager ? <Link to={`/manager/sites/${site.id}?tab=devices`} className="text-blue-600">{site.name}</Link> : site.name}
            </Row>
          )}
          {system && <Row label="System">{SYSTEM_TYPE_LABELS[system.type] ?? system.type}{system.make ? ` · ${system.make}` : ''}</Row>}
          {device.location && <Row label="Location">{device.location}</Row>}
          {(device.make || device.model) && <Row label="Make / Model">{[device.make, device.model].filter(Boolean).join(' ')}</Row>}
          {device.serial_number && <Row label="Serial No."><span className="font-mono text-xs">{device.serial_number}</span></Row>}
          {device.install_date && <Row label="Installed">{device.install_date.split('-').reverse().join('/')}</Row>}
          {device.notes && <Row label="Notes">{device.notes}</Row>}
        </dl>
        {isManager && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => navigate(`/devices/${device.id}/edit`)}
              className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl"
            >
              Edit
            </button>
            {device.qr_code && (
              <button
                onClick={() => navigate(`/devices/${device.id}/qr`)}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
              >
                QR label
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Test history</h2>
          {device.status !== 'removed' && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
            >
              {showForm ? 'Cancel' : 'Record test'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSaveTest} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4 space-y-3">
            <div>
              <label htmlFor="test-result" className="block text-sm font-medium text-gray-700 mb-1">Result</label>
              <select
                id="test-result"
                value={testResult}
                onChange={e => setTestResult(e.target.value as DeviceTestResult)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="not_tested">Not tested</option>
              </select>
            </div>
            <div>
              <label htmlFor="test-note" className="block text-sm font-medium text-gray-700 mb-1">
                Note {testResult === 'fail' ? <span className="text-red-500">*</span> : '(optional)'}
              </label>
              <textarea
                id="test-note"
                value={testNote}
                onChange={e => setTestNote(e.target.value)}
                required={testResult === 'fail'}
                rows={3}
                placeholder={testResult === 'fail' ? 'Describe the fault' : ''}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save test'}
            </button>
          </form>
        )}

        {loadingTests ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : tests.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">No tests recorded yet</p>
        ) : (
          <ul className="space-y-3" data-testid="device-tests">
            {tests.map(test => (
              <li key={test.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {formatUKDateTime(test.tested_at)}{test.jobsheet_id ? ' · service sheet' : ''}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${resultChip[test.result]}`}>
                    {DEVICE_TEST_LABELS[test.result]}
                  </span>
                </div>
                {test.note && <p className="text-sm text-gray-700 mt-1">{test.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
