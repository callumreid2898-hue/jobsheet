import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { useAuth } from '../auth/AuthProvider';
import type { Photo } from '../types';

export function usePhotos(jobsheetId: string) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile || !jobsheetId) { setIsLoading(false); return; }
    async function fetch() {
      try {
        const { data } = await supabase.from('photos').select('*').eq('jobsheet_id', jobsheetId);
        if (data) setPhotos(data as Photo[]);
      } catch {
        const d = await db.photos.where('jobsheet_id').equals(jobsheetId).toArray().catch(() => [] as Photo[]);
        setPhotos(d);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [jobsheetId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { photos, isLoading };
}
