import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { writeRecords } from '../../lib/writeRecord';
import { useAuth } from '../../auth/AuthProvider';
import { useSites } from '../../hooks/useSites';
import type { Quote, QuoteLine } from '../../types';

interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
}

const VAT_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '0.05', label: '5%' },
  { value: '0.20', label: '20%' },
];

function calcTotals(lines: LineItem[]) {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unit_price) || 0;
    const vatRate = parseFloat(l.vat_rate) || 0;
    const lineNet = qty * price;
    subtotal += lineNet;
    vat += lineNet * vatRate;
  }
  return { subtotal, vat, total: subtotal + vat };
}

export function CreateQuotePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { sites } = useSites();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ site_id: '', reference: '', notes: '' });
  const [lines, setLines] = useState<LineItem[]>([
    { description: '', quantity: '1', unit_price: '0.00', vat_rate: '0.20' },
  ]);

  function addLine() {
    setLines(prev => [...prev, { description: '', quantity: '1', unit_price: '0.00', vat_rate: '0.20' }]);
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const now = new Date().toISOString();
    const quote: Quote = {
      id: crypto.randomUUID(),
      company_id: profile.company_id,
      site_id: form.site_id,
      remedial_id: null,
      reference: form.reference,
      status: 'draft',
      notes: form.notes || null,
      created_at: now,
      updated_at: now,
    };

    const quoteLines: QuoteLine[] = lines
      .filter(l => l.description.trim())
      .map((l, i) => ({
        id: crypto.randomUUID(),
        quote_id: quote.id,
        company_id: profile.company_id,
        description: l.description,
        quantity: parseFloat(l.quantity) || 1,
        unit_price: parseFloat(l.unit_price) || 0,
        vat_rate: parseFloat(l.vat_rate) || 0,
        sort_order: i,
        created_at: now,
      }));

    await writeRecords([
      { table: 'quotes', op: 'insert', row: { ...quote } },
      ...quoteLines.map(l => ({ table: 'quote_lines', op: 'insert' as const, row: { ...l } })),
    ]);

    setSaving(false);
    navigate(`/manager/quotes/${quote.id}`);
  }

  const { subtotal, vat, total } = calcTotals(lines);

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/quotes')} className="text-blue-600 text-sm mb-4 inline-block">
        ‹ Back
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">New Quote</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site <span className="text-red-500">*</span></label>
          <select
            required
            value={form.site_id}
            onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">— select site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.address}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference <span className="text-red-500">*</span></label>
          <input
            required
            type="text"
            value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            placeholder="e.g. QT-2024-001"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Line Items</p>
            <button type="button" onClick={addLine} className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5">
              + Add Line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-start gap-2 mb-2">
                  <input
                    type="text"
                    value={line.description}
                    onChange={e => updateLine(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none mt-2">
                      ✕
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Qty</label>
                    <input type="number" min="0" step="0.01" value={line.quantity}
                      onChange={e => updateLine(i, 'quantity', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Unit £</label>
                    <input type="number" min="0" step="0.01" value={line.unit_price}
                      onChange={e => updateLine(i, 'unit_price', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">VAT</label>
                    <select value={line.vat_rate}
                      onChange={e => updateLine(i, 'vat_rate', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white">
                      {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 bg-white border border-gray-100 rounded-xl p-3 text-sm">
            <div className="flex justify-between text-gray-600 mb-1">
              <span>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600 mb-2">
              <span>VAT</span><span>£{vat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-2">
              <span>Total</span><span>£{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create Quote'}
        </button>
      </form>
    </div>
  );
}
