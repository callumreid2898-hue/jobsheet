import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import type { Quote, QuoteLine, QuoteStatus, Site } from '../../types';

const statusConfig: Record<QuoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-gray-100 text-gray-600' },
  sent:     { label: 'Sent',     className: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

const VAT_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 0.05, label: '5%' },
  { value: 0.20, label: '20%' },
];

export function QuoteDetailPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newLine, setNewLine] = useState({ description: '', quantity: '1', unit_price: '0.00', vat_rate: 0.20 });
  const [addingLine, setAddingLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    if (!quoteId) return;
    setIsLoading(true);
    try {
      let q: Quote | null = await db.quotes.get(quoteId).catch(() => null) ?? null;
      if (!q) {
        const { data } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
        if (data) { q = data as Quote; db.quotes.put(q).catch(() => {}); }
      }
      setQuote(q);

      if (q?.site_id) {
        let s: Site | null = await db.sites.get(q.site_id).catch(() => null) ?? null;
        if (!s) {
          const { data } = await supabase.from('sites').select('*').eq('id', q.site_id).single();
          if (data) { s = data as Site; db.sites.put(s).catch(() => {}); }
        }
        setSite(s);
      }

      let ls: QuoteLine[] = [];
      try {
        const { data } = await supabase.from('quote_lines').select('*').eq('quote_id', quoteId).order('sort_order');
        if (data) { ls = data as QuoteLine[]; db.quote_lines.bulkPut(ls).catch(() => {}); }
      } catch {
        ls = await db.quote_lines.where('quote_id').equals(quoteId).toArray().catch(() => []);
        ls.sort((a, b) => a.sort_order - b.sort_order);
      }
      setLines(ls);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(status: QuoteStatus) {
    if (!quote || !quoteId) return;
    setUpdatingStatus(true);
    const now = new Date().toISOString();
    await supabase.from('quotes').update({ status, updated_at: now }).eq('id', quoteId);
    const updated = { ...quote, status, updated_at: now };
    await db.quotes.put(updated).catch(() => {});
    setQuote(updated);
    setUpdatingStatus(false);
  }

  async function deleteLine(line: QuoteLine) {
    await supabase.from('quote_lines').delete().eq('id', line.id);
    await db.quote_lines.delete(line.id).catch(() => {});
    setLines(prev => prev.filter(l => l.id !== line.id));
  }

  async function saveNewLine() {
    if (!quote || !profile || !newLine.description.trim()) return;
    setSavingLine(true);
    const now = new Date().toISOString();
    const line: QuoteLine = {
      id: crypto.randomUUID(),
      quote_id: quote.id,
      company_id: profile.company_id,
      description: newLine.description,
      quantity: parseFloat(newLine.quantity) || 1,
      unit_price: parseFloat(newLine.unit_price) || 0,
      vat_rate: newLine.vat_rate,
      sort_order: lines.length,
      created_at: now,
    };
    await db.quote_lines.put(line).catch(() => {});
    await supabase.from('quote_lines').insert(line);
    setLines(prev => [...prev, line]);
    setNewLine({ description: '', quantity: '1', unit_price: '0.00', vat_rate: 0.20 });
    setAddingLine(false);
    setSavingLine(false);
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  if (!quote) {
    return <div className="px-4 pt-8 text-center text-gray-400">Quote not found</div>;
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vatTotal = lines.reduce((s, l) => s + l.quantity * l.unit_price * l.vat_rate, 0);
  const total = subtotal + vatTotal;
  const cfg = statusConfig[quote.status];

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/quotes')} className="text-blue-600 text-sm mb-4 inline-block">
        ‹ Back
      </button>

      <div className="flex items-start justify-between gap-2 mb-1">
        <h1 className="text-xl font-bold text-gray-900">{quote.reference}</h1>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 mt-1 ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">{site?.address ?? 'Unknown site'}</p>
      {quote.notes && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3 mb-4">{quote.notes}</p>
      )}

      {/* Status actions */}
      {(quote.status === 'draft' || quote.status === 'sent') && (
        <div className="flex gap-2 mb-6">
          {quote.status === 'draft' && (
            <button onClick={() => updateStatus('sent')} disabled={updatingStatus}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60">
              Mark Sent
            </button>
          )}
          {quote.status === 'sent' && (
            <>
              <button onClick={() => updateStatus('accepted')} disabled={updatingStatus}
                className="flex-1 bg-green-600 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60">
                Mark Accepted
              </button>
              <button onClick={() => updateStatus('rejected')} disabled={updatingStatus}
                className="flex-1 bg-red-500 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60">
                Mark Rejected
              </button>
            </>
          )}
        </div>
      )}

      {/* Lines */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Unit £</th>
                <th className="px-3 py-2.5 text-right">VAT</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map(l => {
                const lineTotal = l.quantity * l.unit_price * (1 + l.vat_rate);
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 text-gray-800">{l.description}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{l.quantity}</td>
                    <td className="px-3 py-3 text-right text-gray-600">£{l.unit_price.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{Math.round(l.vat_rate * 100)}%</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">£{lineTotal.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => deleteLine(l)} className="text-gray-300 hover:text-red-400 text-base leading-none">✕</button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No line items</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 text-sm border-t border-gray-100">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-gray-500">Subtotal</td>
                <td className="px-3 py-2 text-right text-gray-700">£{subtotal.toFixed(2)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-gray-500">VAT</td>
                <td className="px-3 py-2 text-right text-gray-700">£{vatTotal.toFixed(2)}</td>
                <td></td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={4} className="px-4 py-2.5 text-right text-gray-900">Total</td>
                <td className="px-3 py-2.5 text-right text-gray-900">£{total.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add line */}
      {addingLine ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3 mb-4">
          <input type="text" value={newLine.description}
            onChange={e => setNewLine(n => ({ ...n, description: e.target.value }))}
            placeholder="Description"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Qty</label>
              <input type="number" min="0" step="0.01" value={newLine.quantity}
                onChange={e => setNewLine(n => ({ ...n, quantity: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unit £</label>
              <input type="number" min="0" step="0.01" value={newLine.unit_price}
                onChange={e => setNewLine(n => ({ ...n, unit_price: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">VAT</label>
              <select value={newLine.vat_rate}
                onChange={e => setNewLine(n => ({ ...n, vat_rate: parseFloat(e.target.value) }))}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white">
                {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveNewLine} disabled={savingLine}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-60">
              {savingLine ? 'Saving…' : 'Add Line'}
            </button>
            <button onClick={() => setAddingLine(false)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-xl">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingLine(true)}
          className="w-full border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl mb-4">
          + Add Line
        </button>
      )}
    </div>
  );
}
