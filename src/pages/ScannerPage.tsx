import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import type { Device } from '../types';

export function ScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          void (async () => {
            await scanner.stop();
            setScanning(false);
            setResult(decodedText);

            // Look up device by qr_code — try Dexie first
            let found: Device | undefined = await db.devices
              .where('qr_code')
              .equals(decodedText)
              .first()
              .catch(() => undefined);

            if (!found) {
              const { data } = await supabase
                .from('devices')
                .select('*')
                .eq('qr_code', decodedText)
                .single();
              if (data) {
                found = data as Device;
                db.devices.put(found).catch(() => {});
              }
            }

            if (found) {
              setDevice(found);
            } else {
              setError('Device not found. This QR code is not registered.');
            }
          })();
        },
        () => {
          // ignore per-frame errors
        }
      )
      .then(() => setScanning(true))
      .catch((err: unknown) => {
        setError(`Camera error: ${String(err)}`);
      });

    return () => {
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 text-sm"
          aria-label="Go back"
        >
          ‹ Back
        </button>
        <h1 className="font-semibold text-gray-900 flex-1">Scan Device QR</h1>
      </div>

      <div className="flex flex-col items-center px-4 py-6 flex-1">
        {/* Camera viewfinder — always rendered so html5-qrcode can attach */}
        <div
          id="qr-reader"
          className="w-full max-w-sm mx-auto rounded-xl overflow-hidden"
          style={{ display: result ? 'none' : undefined }}
        />

        {/* Helper text while scanning */}
        {scanning && !result && (
          <p className="mt-3 text-sm text-gray-500 text-center">
            Point camera at QR code
          </p>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-4 w-full max-w-sm bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Success state — device found */}
        {device && (
          <div className="mt-4 w-full max-w-sm">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1 mb-4">
              <p className="font-semibold text-green-800 capitalize">
                {device.type.replace(/_/g, ' ')}
                {device.location ? ` — ${device.location}` : ''}
              </p>
              {(device.make || device.model) && (
                <p className="text-sm text-green-700">
                  {[device.make, device.model].filter(Boolean).join(' ')}
                </p>
              )}
            </div>

            <button
              onClick={() =>
                navigate(`/manager/sites/${device.site_id}/devices/${device.id}`)
              }
              className="w-full bg-blue-600 text-white text-sm font-medium py-3 rounded-xl mb-3"
            >
              View Device
            </button>

            <button
              onClick={() => window.location.reload()}
              className="w-full border border-gray-300 text-gray-700 text-sm font-medium py-3 rounded-xl"
            >
              Scan Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
