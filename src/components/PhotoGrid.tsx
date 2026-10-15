import type { PhotoRef } from '../types';

interface Props { photos: PhotoRef[]; onRemove?: (id: string) => void; }

export function PhotoGrid({ photos, onRemove }: Props) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map(photo => (
        <div key={photo.id} className="relative aspect-square">
          <img
            src={photo.local_uri ?? photo.storage_path}
            alt={photo.caption ?? 'Photo'}
            className="w-full h-full object-cover rounded-lg border border-gray-200"
          />
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(photo.id)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
            >×</button>
          )}
        </div>
      ))}
    </div>
  );
}
