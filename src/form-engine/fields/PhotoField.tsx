import { useRef } from 'react';
import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, PhotoRef } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function PhotoField({ field, value, onChange, readOnly, error }: Props) {
  const photos = (value as PhotoRef[] | null) ?? [];
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newPhotos: PhotoRef[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      local_uri: URL.createObjectURL(file),
      caption: file.name,
    }));
    onChange([...photos, ...newPhotos]);
  }

  function removePhoto(id: string) {
    onChange(photos.filter(p => p.id !== id));
  }

  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {photos.map(photo => (
            <div key={photo.id} className="relative aspect-square">
              <img
                src={photo.local_uri ?? photo.storage_path}
                alt={photo.caption ?? 'Photo'}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 text-sm hover:border-blue-400 hover:text-blue-600 w-full justify-center min-h-[44px]"
          >
            <span className="text-xl">[camera]</span>
            Add Photo
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
