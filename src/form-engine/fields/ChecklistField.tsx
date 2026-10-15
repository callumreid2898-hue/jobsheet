import { useState } from 'react';
import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, ChecklistAnswers } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function ChecklistField({ field, value, onChange, readOnly, error }: Props) {
  const current = (value as ChecklistAnswers | null) ?? {};
  const [staticItems] = useState(() => field.items ?? []);
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');

  const allItems = [...staticItems, ...customItems];

  function toggle(item: string) {
    onChange({ ...current, [item]: !current[item] });
  }

  function addItem() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setCustomItems(prev => [...prev, trimmed]);
    onChange({ ...current, [trimmed]: false });
    setNewItem('');
  }

  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.hint && <p className="text-xs text-gray-500 mb-2">{field.hint}</p>}
      <div className="space-y-2">
        {allItems.map(item => (
          <label key={item} className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={current[item] ?? false}
              onChange={() => !readOnly && toggle(item)}
              disabled={readOnly}
              className="w-5 h-5 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">{item}</span>
          </label>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Add item..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="button" onClick={addItem} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">+</button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
