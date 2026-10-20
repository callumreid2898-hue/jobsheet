import { useRef, useState } from 'react';
import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, PhotoRef } from '../../types';
import { compressImage, deleteLocalBlob, photoPath, saveLocalBlob } from '../../lib/media';
import { useFormMedia } from '../FormContext';
import { MediaImage } from './MediaImage';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function PhotoField({ field, value, onChange, readOnly, error }: Props) {
  const photos = ((value as PhotoRef[] | null) ?? []).filter(p => p.storage_path);
  const inputRef = useRef<HTMLInputElement>(null);
  const { jobsheetId, companyId } = useFormMedia();
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsAdding(true);
    setAddError(null);
    try {
      // Saved to the device straight away; uploaded when the jobsheet is submitted
      const added: PhotoRef[] = [];
      for (const file of Array.from(files)) {
        const id = crypto.randomUUID();
        const path = photoPath(companyId, jobsheetId, id);
        await saveLocalBlob(path, jobsheetId, await compressImage(file));
        added.push({ id, storage_path: path, caption: field.label });
      }
      onChange([...photos, ...added]);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAdding(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removePhoto(photo: PhotoRef) {
    onChange(photos.filter(p => p.id !== photo.id));
    deleteLocalBlob(photo.storage_path).catch(() => {/* removed again at submit */});
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
              <MediaImage
                path={photo.storage_path}
                alt={photo.caption ?? 'Photo'}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  aria-label="Remove photo"
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
            disabled={isAdding}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 text-sm hover:border-blue-400 hover:text-blue-600 w-full justify-center min-h-[44px] disabled:opacity-60"
          >
            <span className="text-xl">[camera]</span>
            {isAdding ? 'Saving photo…' : 'Add Photo'}
          </button>
        </>
      )}
      {addError && <p className="text-xs text-red-500 mt-1" role="alert">Couldn't save the photo on this device ({addError}).</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
