import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MEDIA_BUCKET, getLocalBlob } from '../lib/media';

/**
 * An <img> src for a photos-bucket path: the local blob while it's still on this
 * device, otherwise a short-lived signed URL. Data URLs (older signatures) pass through.
 */
export function useMediaSrc(path: string | null | undefined): { src: string | null; failed: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!path) return;
    if (path.startsWith('data:')) { setSrc(path); return; }

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      const local = await getLocalBlob(path).catch(() => undefined);
      if (cancelled) return;
      if (local) {
        objectUrl = URL.createObjectURL(local);
        setSrc(objectUrl);
        return;
      }
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
      if (cancelled) return;
      if (error || !data) setFailed(true);
      else setSrc(data.signedUrl);
    })().catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { src, failed };
}
