import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { fetchCached } from '../lib/cachedQuery';
import { Spinner } from '../components/ui/Spinner';
import type { Device } from '../types';

/** /d/:code, the link on a device's QR label: opens that device. */
export function DeviceLinkPage() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<{ deviceId: string } | { missing: boolean; offline: boolean } | null>(null);

  useEffect(() => {
    if (!code) return;
    fetchCached<Device>({ table: 'devices', eq: { qr_code: code } }).then(({ rows, fromCache }) => {
      setState(rows[0] ? { deviceId: rows[0].id } : { missing: true, offline: fromCache });
    });
  }, [code]);

  if (!state) return <div className="flex justify-center py-12"><Spinner /></div>;
  if ('deviceId' in state) return <Navigate to={`/devices/${state.deviceId}`} replace />;
  return (
    <div className="p-6 text-center text-gray-500 text-sm">
      {state.offline
        ? "You're offline and this device isn't saved on this phone. Try again with a connection."
        : "This label isn't registered to a device in your company."}
    </div>
  );
}
