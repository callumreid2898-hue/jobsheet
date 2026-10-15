import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, YesNoNa } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

const OPTIONS: { value: YesNoNa; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'n/a', label: 'N/A' },
];

export function YesNoNaField({ field, value, onChange, readOnly, error }: Props) {
  const current = value as YesNoNa | null;
  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}
      <div className="flex gap-2">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange(opt.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors min-h-[44px] ${
              current === opt.value
                ? opt.value === 'no'
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            } ${readOnly ? 'opacity-75 cursor-default' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
