import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { Spinner } from '../../components/ui/Spinner';
import type { Device } from '../../types';

export function DeviceQRPage() {
  const { siteId, deviceId } = useParams<{ siteId: string; deviceId: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    async function load() {
      let found: Device | undefined = await db.devices.get(deviceId!).catch(() => undefined);
      if (!found) {
        const { data } = await supabase.from('devices').select('*').eq('id', deviceId).single();
        if (data) {
          found = data as Device;
          db.devices.put(found).catch(() => {});
        }
      }
      setDevice(found ?? null);
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, [deviceId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="p-6 text-center text-gray-500">Device not found.</div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 flex flex-col">
      {/* Back link */}
      <div className="mb-4">
        <Link
          to={`/manager/sites/${siteId}/devices/${deviceId}`}
          className="text-blue-600 text-sm"
        >
          ‹ Back
        </Link>
      </div>

      {/* Heading */}
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900 capitalize">
          {device.type.replace(/_/g, ' ')}
        </h1>
        {device.location && (
          <p className="text-sm text-gray-500 mt-1">{device.location}</p>
        )}
      </div>

      {device.qr_code ? (
        <div className="flex flex-col items-center flex-1">
          {/* QR code */}
          <div className="bg-white p-4 rounded-2xl shadow border border-gray-100">
            <QRCode value={device.qr_code} size={256} />
          </div>

          {/* QR UUID */}
          <p className="mt-3 text-xs text-gray-400 font-mono break-all text-center max-w-xs">
            {device.qr_code}
          </p>

          {/* Device info */}
          <div className="mt-6 w-full max-w-sm bg-gray-50 rounded-xl p-4 space-y-2">
            {(device.make || device.model) && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Make / Model</span>
                <span className="text-gray-800 font-medium">
                  {[device.make, device.model].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
            {device.serial_number && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Serial No.</span>
                <span className="text-gray-800 font-mono">{device.serial_number}</span>
              </div>
            )}
          </div>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="w-full mt-6 border border-gray-300 text-gray-700 text-sm font-medium py-3 rounded-xl"
          >
            Print QR Code
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm text-center">
            This device has no QR code assigned.
          </p>
        </div>
      )}
    </div>
  );
}
