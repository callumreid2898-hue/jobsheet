import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { fetchOneCached } from '../lib/cachedQuery';
import { deviceLabel, deviceQrUrl } from '../lib/devices';
import { Spinner } from '../components/ui/Spinner';
import type { Device, Site } from '../types';

/** A printable QR label. The code is a link to the app, so any phone camera opens the device. */
export function DeviceQRPage() {
  const navigate = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    (async () => {
      const d = await fetchOneCached<Device>('devices', deviceId);
      setDevice(d);
      if (d) setSite(await fetchOneCached<Site>('sites', d.site_id));
      setIsLoading(false);
    })().catch(() => setIsLoading(false));
  }, [deviceId]);

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!device) return <div className="p-6 text-center text-gray-500">Device not found.</div>;

  return (
    <div className="bg-white px-4 py-6 flex flex-col items-center print:p-0">
      <div className="self-stretch mb-4 print:hidden">
        <button onClick={() => navigate(`/devices/${device.id}`)} className="text-blue-600 text-sm">‹ Back</button>
      </div>

      {device.qr_code ? (
        <>
          {/* The label: the only thing that prints */}
          <div className="border border-gray-200 rounded-2xl p-4 flex flex-col items-center text-center print:border-black print:rounded-none" data-testid="qr-label">
            <QRCode value={deviceQrUrl(device.qr_code, window.location.origin)} size={200} />
            <p className="mt-3 text-sm font-semibold text-gray-900">{deviceLabel(device)}</p>
            {site && <p className="text-xs text-gray-600">{site.name}</p>}
            {device.serial_number && <p className="text-xs text-gray-500 font-mono">S/N {device.serial_number}</p>}
          </div>
          <p className="mt-3 text-xs text-gray-400 text-center max-w-xs print:hidden">
            Scan with the app's scanner or any phone camera to open this device.
          </p>
          <button
            onClick={() => window.print()}
            className="w-full max-w-sm mt-6 border border-gray-300 text-gray-700 text-sm font-medium py-3 rounded-xl print:hidden"
          >
            Print label
          </button>
        </>
      ) : (
        <p className="text-gray-500 text-sm text-center py-12">This device has no QR code assigned.</p>
      )}
    </div>
  );
}
