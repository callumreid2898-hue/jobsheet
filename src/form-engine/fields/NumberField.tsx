import type { FieldDef } from '../../templates/types';
import type { FieldAnswer } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function NumberField({ field, value, onChange, readOnly, error }: Props) {
  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.hint && <p className="text-xs text-gray-500 mb-1">{field.hint}</p>}
      <input
        type="number"
        value={(value as number) ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        readOnly={readOnly}
        disabled={readOnly}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400' : 'border-gray-300'} ${readOnly ? 'bg-gray-50' : 'bg-white'}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
