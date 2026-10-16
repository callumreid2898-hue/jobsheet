import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import type { Device, DeviceTest, DeviceTestResult } from '../../types';

function formatDeviceType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTestedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const resultChip: Record<DeviceTestResult, string> = {
  pass:       'bg-green-100 text-green-700',
  fail:       'bg-red-100 text-red-700',
  not_tested: 'bg-gray-100 text-gray-500',
};

const resultLabel: Record<DeviceTestResult, string> = {
  pass:       'Pass',
  fail:       'Fail',
  not_tested: 'Not Tested',
};

export function DeviceDetailPage() {
  const navigate = useNavigate();
  const { siteId, deviceId } = useParams<{ siteId: string; deviceId: string }>();
  const { profile } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [tests, setTests] = useState<DeviceTest[]>([]);
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingTests, setLoadingTests] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testResult, setTestResult] = useState<DeviceTestResult>('pass');
  const [testNote, setTestNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    async function loadDevice() {
      setLoadingDevice(true);
      const local = await db.devices.get(deviceId!).catch(() => null);
      if (local) { setDevice(local); setLoadingDevice(false); return; }
      const { data } = await supabase.from('devices').select('*').eq('id', deviceId!).single();
      if (data) setDevice(data as Device);
      setLoadingDevice(false);
    }
    loadDevice();
  }, [deviceId]);

  async function loadTests() {
    if (!deviceId) return;
    setLoadingTests(true);
    try {
      const { data } = await supabase
        .from('device_tests')
        .select('*')
        .eq('device_id', deviceId)
        .order('tested_at', { ascending: false });
      if (data) {
        setTests(data as DeviceTest[]);
        db.device_tests.bulkPut(data as DeviceTest[]).catch(() => {});
      }
    } catch {
      const local = await db.device_tests.where('device_id').equals(deviceId).toArray().catch(() => [] as DeviceTest[]);
      local.sort((a, b) => b.tested_at.localeCompare(a.tested_at));
      setTests(local);
    } finally {
      setLoadingTests(false);
    }
  }

  useEffect(() => { loadTests(); }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveTest(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !deviceId) return;
    setSaving(true);
    const test: DeviceTest = {
      id: crypto.randomUUID(),
      device_id: deviceId,
      jobsheet_id: null,
      company_id: profile.company_id,
      result: testResult,
      note: testNote || null,
      tested_at: new Date().toISOString(),
    };
    await db.device_tests.put(test).catch(() => {});
    await supabase.from('device_tests').insert(test);
    setSaving(false);
    setShowForm(false);
    setTestResult('pass');
    setTestNote('');
    await loadTests();
  }

  if (loadingDevice) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (!device) {
    return (
      <div className="px-4 pt-6 pb-6">
        <button onClick={() => navigate(`/manager/sites/${siteId}/devices`)} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
        <p className="text-center text-gray-400 py-12">Device not found</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button
        onClick={() => navigate(`/manager/sites/${siteId}/devices`)}
        className="text-blue-600 text-sm mb-4 inline-block"
      >
        ‹ Back
      </button>

      {/* Device info card */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-3">{formatDeviceType(device.type)}</h1>
        <dl className="space-y-2 text-sm">
          {device.location && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">Location</dt>
              <dd className="text-gray-800">{device.location}</dd>
            </div>
          )}
          {(device.make || device.model) && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">Make / Model</dt>
              <dd className="text-gray-800">{[device.make, device.model].filter(Boolean).join(' ')}</dd>
            </div>
          )}
          {device.serial_number && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">Serial No.</dt>
              <dd className="text-gray-800 font-mono text-xs">{device.serial_number}</dd>
            </div>
          )}
          {device.install_date && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">Installed</dt>
              <dd className="text-gray-800">{device.install_date}</dd>
            </div>
          )}
          {device.qr_code && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">QR Code ID</dt>
              <dd className="text-gray-600 font-mono text-xs truncate">{device.qr_code}</dd>
            </div>
          )}
          {device.notes && (
            <div className="flex gap-2">
              <dt className="text-gray-400 w-28 shrink-0">Notes</dt>
              <dd className="text-gray-800">{device.notes}</dd>
            </div>
          )}
        </dl>
        <button
          onClick={() => navigate(`/manager/sites/${siteId}/devices/${deviceId}/qr`)}
          className="mt-4 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          View QR Code
        </button>
      </div>

      {/* Test history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Test History</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            {showForm ? 'Cancel' : 'Record Test'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSaveTest} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Result</label>
              <select
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                value={testNote}
                onChange={e => setTestNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Test'}
            </button>
          </form>
        )}

        {loadingTests ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : tests.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">No tests recorded yet</p>
        ) : (
          <div className="space-y-3">
            {tests.map(test => (
              <div key={test.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{formatTestedAt(test.tested_at)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${resultChip[test.result]}`}>
                    {resultLabel[test.result]}
                  </span>
                </div>
                {test.note && <p className="text-sm text-gray-700 mt-1">{test.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
