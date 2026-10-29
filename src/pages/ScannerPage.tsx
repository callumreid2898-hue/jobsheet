import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { fetchCached } from '../lib/cachedQuery';
import { deviceLabel, parseDevicePayload } from '../lib/devices';
import type { Device } from '../types';

type ScanState =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'looking_up' }
  | { kind: 'found'; device: Device }
  | { kind: 'error'; message: string };

export function ScannerPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<ScanState>({ kind: 'starting' });
  // Bumped by "Scan again" to restart the camera
  const [attempt, setAttempt] = useState(0);
  const handled = useRef(false);

  useEffect(() => {
    handled.current = false;
    setState({ kind: 'starting' });
    const scanner = new Html5Qrcode('qr-reader');
    let unmounted = false;

    // stop() throws unless the camera is running, and start() may still be pending
    const started = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        decodedText => {
          // The library reports the same code many times a second: act on the first only
          if (handled.current) return;
          handled.current = true;
          void onDecoded(decodedText);
        },
        () => { /* per-frame "no code" errors */ },
      )
      .then(() => {
        if (unmounted) return false;
        setState(s => (s.kind === 'starting' ? { kind: 'scanning' } : s));
        return true;
      })
      .catch((err: unknown) => {
        if (!unmounted) setState({ kind: 'error', message: `Couldn't start the camera: ${String(err)}` });
        return false;
      });

    const stop = () => started.then(running => (running ? scanner.stop() : undefined)).catch(() => {});

    async function onDecoded(text: string) {
      await stop();
      if (unmounted) return;
      const code = parseDevicePayload(text);
      if (!code) {
        setState({ kind: 'error', message: "That QR code isn't a device label." });
        return;
      }
      setState({ kind: 'looking_up' });
      // Works offline from the cache (devices on the engineer's job sites are saved ahead)
      const { rows, fromCache } = await fetchCached<Device>({ table: 'devices', eq: { qr_code: code } });
      if (unmounted) return;
      if (rows[0]) setState({ kind: 'found', device: rows[0] });
      else setState({
        kind: 'error',
        message: fromCache
          ? "You're offline and this device isn't saved on this phone. Try again with a connection."
          : "This label isn't registered to a device in your company.",
      });
    }

    return () => {
      unmounted = true;
      void stop().finally(() => { try { scanner.clear(); } catch { /* already cleared */ } });
    };
  }, [attempt]);

  const showCamera = state.kind === 'starting' || state.kind === 'scanning';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-blue-600 text-sm" aria-label="Go back">‹ Back</button>
        <h1 className="font-semibold text-gray-900 flex-1">Scan device QR</h1>
      </div>

      <div className="flex flex-col items-center px-4 py-6 flex-1">
        {/* Always rendered so html5-qrcode can attach */}
        <div
          id="qr-reader"
          className="w-full max-w-sm mx-auto rounded-xl overflow-hidden"
          style={{ display: showCamera ? undefined : 'none' }}
        />

        {state.kind === 'scanning' && (
          <p className="mt-3 text-sm text-gray-500 text-center">Point the camera at the device's QR label</p>
        )}
        {state.kind === 'looking_up' && <p className="mt-3 text-sm text-gray-500 text-center">Looking up device…</p>}

        {state.kind === 'error' && (
          <div className="mt-4 w-full max-w-sm bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm text-center">{state.message}</p>
          </div>
        )}

        {state.kind === 'found' && (
          <div className="mt-4 w-full max-w-sm">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1 mb-4">
              <p className="font-semibold text-green-800">{deviceLabel(state.device)}</p>
              {(state.device.make || state.device.model) && (
                <p className="text-sm text-green-700">{[state.device.make, state.device.model].filter(Boolean).join(' ')}</p>
              )}
            </div>
            <button
              onClick={() => navigate(`/devices/${state.device.id}`)}
              className="w-full bg-blue-600 text-white text-sm font-medium py-3 rounded-xl mb-3"
            >
              View device
            </button>
          </div>
        )}

        {(state.kind === 'found' || state.kind === 'error') && (
          <button
            onClick={() => setAttempt(a => a + 1)}
            className="w-full max-w-sm mt-3 border border-gray-300 text-gray-700 text-sm font-medium py-3 rounded-xl"
          >
            Scan again
          </button>
        )}
      </div>
    </div>
  );
}
