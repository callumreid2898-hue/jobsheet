import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { useDevices } from '../../hooks/useDevices';
import { Spinner } from '../../components/ui/Spinner';
import type { Site } from '../../types';

function formatDeviceType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function SiteDevicesPage() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const { devices, isLoading } = useDevices({ siteId });
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    if (!siteId) return;
    async function loadSite() {
      setSite(await fetchOneCached<Site>('sites', siteId!));
    }
    loadSite();
  }, [siteId]);

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/sites')} className="text-blue-600 text-sm mb-4 inline-block">
        ‹ Back to Sites
      </button>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 truncate">
          {site ? site.address : 'Devices'}
        </h1>
        <button
          onClick={() => navigate(`/manager/sites/${siteId}/devices/add`)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl shrink-0 ml-2"
        >
          + Add Device
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : devices.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No devices registered for this site</p>
      ) : (
        <div className="space-y-3">
          {devices.map(device => (
            <div
              key={device.id}
              onClick={() => navigate(`/manager/sites/${siteId}/devices/${device.id}`)}
              className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer active:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{formatDeviceType(device.type)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{device.location ?? 'Location unknown'}</p>
                  {(device.make || device.model) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[device.make, device.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>
                {device.qr_code && (
                  <span className="text-gray-300 text-xl ml-2 mt-0.5" title="QR code assigned">▦</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
