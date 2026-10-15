import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, PassFailNote } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function PassFailNoteField({ field, value, onChange, readOnly, error }: Props) {
  const current = (value as PassFailNote | null) ?? { result: null, note: '' };

  function update(patch: Partial<PassFailNote>) {
    onChange({ ...current, ...patch });
  }

  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}
      <div className="flex gap-3 mb-2">
        {(['pass', 'fail'] as const).map(result => (
          <button
            key={result}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && update({ result })}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors min-h-[44px] uppercase ${
              current.result === result
                ? result === 'pass'
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-red-500 text-white border-red-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            } ${readOnly ? 'opacity-75 cursor-default' : ''}`}
          >
            {result}
          </button>
        ))}
      </div>
      {(current.result === 'fail' || current.note) && (
        <textarea
          value={current.note}
          onChange={e => update({ note: e.target.value })}
          readOnly={readOnly}
          disabled={readOnly}
          rows={3}
          placeholder={current.result === 'fail' ? 'Describe the fault (required)' : 'Note'}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${readOnly ? 'bg-gray-50 border-gray-200' : 'border-gray-300'}`}
        />
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
