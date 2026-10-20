import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../lib/db';
import { fetchCached } from '../../lib/cachedQuery';
import { writeRecords } from '../../lib/writeRecord';
import { useAuth } from '../../auth/AuthProvider';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { useJobs } from '../../hooks/useJobs';
import { Spinner } from '../../components/ui/Spinner';
import { ToastStack } from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import type { Invoice, InvoiceLine, QuoteLine } from '../../types';

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: number;
}

const VAT_OPTIONS = [
  { value: 0,    label: '0%'  },
  { value: 0.20, label: '20%' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function newLine(): LineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit_price: '0.00',
    vat_rate: 0.20,
  };
}

function calcTotals(lines: LineItem[]) {
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const qty = parseFloat(l.quantity) || 0;
    const up  = parseFloat(l.unit_price) || 0;
    net += qty * up;
    vat += qty * up * l.vat_rate;
  }
  return { net, vat, total: net + vat };
}

export function CreateInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quoteIdParam = searchParams.get('quoteId');
  const { profile } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  // Field state
  const [customerId, setCustomerId]     = useState('');
  const [siteId, setSiteId]             = useState('');
  const [jobId, setJobId]               = useState('');
  const [quoteId, setQuoteId]           = useState(quoteIdParam ?? '');
  const [reference, setReference]       = useState('');
  const [issuedDate, setIssuedDate]     = useState(todayIso());
  const [dueDate, setDueDate]           = useState(addDays(todayIso(), 30));
  const [notes, setNotes]               = useState('');
  const [lines, setLines]               = useState<LineItem[]>([newLine()]);
  const [submitting, setSubmitting]     = useState(false);
  const [refLoading, setRefLoading]     = useState(true);
  const [importingLines, setImportingLines] = useState(false);

  const { customers, isLoading: customersLoading } = useCustomers();
  const { sites, isLoading: sitesLoading } = useSites();
  const { jobs, isLoading: jobsLoading } = useJobs();

  // Filter sites by customer
  const filteredSites = customerId
    ? sites.filter(s => s.customer_id === customerId)
    : sites;

  // Filter jobs by site
  const filteredJobs = siteId
    ? jobs.filter(j => j.site_id === siteId)
    : jobs;

  // Auto-generate reference
  useEffect(() => {
    if (!profile) return;
    (async () => {
      setRefLoading(true);
      try {
        const existing = await db.invoices
          .where('company_id')
          .equals(profile.company_id)
          .count();
        const year = new Date().getFullYear();
        setReference(`INV-${year}-${String(existing + 1).padStart(3, '0')}`);
      } finally {
        setRefLoading(false);
      }
    })();
  }, [profile]);

  // When customer changes, reset site/job
  function handleCustomerChange(val: string) {
    setCustomerId(val);
    setSiteId('');
    setJobId('');
  }

  // When site changes, reset job
  function handleSiteChange(val: string) {
    setSiteId(val);
    setJobId('');
  }

  // Import lines from quote
  async function importFromQuote() {
    if (!quoteId || !profile) return;
    setImportingLines(true);
    try {
      const { rows: qLines } = await fetchCached<QuoteLine>({
        table: 'quote_lines', eq: { quote_id: quoteId }, order: { column: 'sort_order' },
      });

      if (qLines.length === 0) {
        addToast('No lines found on that quote.', 'warning');
        return;
      }

      const imported: LineItem[] = qLines.map(ql => ({
        id: crypto.randomUUID(),
        description: ql.description,
        quantity: String(ql.quantity),
        unit_price: ql.unit_price.toFixed(2),
        vat_rate: ql.vat_rate,
      }));
      setLines(imported);
      addToast('Lines imported from quote.', 'success');
    } finally {
      setImportingLines(false);
    }
  }

  function addLineRow() {
    setLines(prev => [...prev, newLine()]);
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function updateLine(id: string, field: keyof LineItem, value: string | number) {
    setLines(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: value } : l)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!customerId || !siteId) {
      addToast('Customer and Site are required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const invoiceId = crypto.randomUUID();

      const invoice: Invoice = {
        id: invoiceId,
        company_id: profile.company_id,
        customer_id: customerId,
        site_id: siteId,
        job_id: jobId || null,
        quote_id: quoteId || null,
        reference,
        status: 'draft',
        notes: notes || null,
        issued_date: issuedDate || null,
        due_date: dueDate || null,
        paid_date: null,
        created_at: now,
        updated_at: now,
      };

      const invoiceLines: InvoiceLine[] = lines
        .filter(l => l.description.trim())
        .map((l, idx) => ({
          id: crypto.randomUUID(),
          invoice_id: invoiceId,
          company_id: profile.company_id,
          description: l.description,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          vat_rate: l.vat_rate,
          sort_order: idx,
          created_at: now,
        }));

      // Kept on the device and queued if the server can't take it (writeRecords shows why)
      await writeRecords([
        { table: 'invoices', op: 'insert', row: { ...invoice } },
        ...invoiceLines.map(l => ({ table: 'invoice_lines', op: 'insert' as const, row: { ...l } })),
      ]);

      navigate(`/manager/invoices/${invoiceId}`);
    } catch (err) {
      console.error(err);
      addToast('Failed to create invoice. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const isDataLoading = customersLoading || sitesLoading || refLoading;
  const { net, vat, total } = calcTotals(lines);

  if (isDataLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/manager/invoices')}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Details card */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Details</h2>

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={customerId}
              onChange={e => handleCustomerChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
            >
              <option value="">Select customer…</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Site */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Site <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={siteId}
              onChange={e => handleSiteChange(e.target.value)}
              disabled={!customerId}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Select site…</option>
              {filteredSites.map(s => (
                <option key={s.id} value={s.id}>{s.address}</option>
              ))}
            </select>
          </div>

          {/* Job (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Job <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <select
              value={jobId}
              onChange={e => setJobId(e.target.value)}
              disabled={!siteId || jobsLoading}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">None</option>
              {filteredJobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.scheduled_date} — {j.type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Quote (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Quote ID <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={quoteId}
                onChange={e => setQuoteId(e.target.value)}
                placeholder="Quote UUID or leave blank"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
              />
              {quoteId && (
                <button
                  type="button"
                  onClick={importFromQuote}
                  disabled={importingLines}
                  className="shrink-0 bg-slate-100 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-200 disabled:opacity-60 transition-colors"
                >
                  {importingLines ? 'Importing…' : 'Import lines from Quote'}
                </button>
              )}
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Issued Date</label>
              <input
                type="date"
                value={issuedDate}
                onChange={e => setIssuedDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]/30 resize-none"
            />
          </div>
        </section>

        {/* Line items card */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Line Items</h2>
            <button
              type="button"
              onClick={addLineRow}
              className="text-sm font-medium text-[#0D3349] hover:underline"
            >
              + Add Line
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide w-28">Unit £</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide w-20">VAT</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide w-24">Total</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map(line => {
                  const qty = parseFloat(line.quantity) || 0;
                  const up  = parseFloat(line.unit_price) || 0;
                  const lineTotal = qty * up * (1 + line.vat_rate);
                  return (
                    <tr key={line.id}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={e => updateLine(line.id, 'description', e.target.value)}
                          placeholder="Description…"
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0D3349]/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.quantity}
                          onChange={e => updateLine(line.id, 'quantity', e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#0D3349]/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={e => updateLine(line.id, 'unit_price', e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#0D3349]/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={line.vat_rate}
                          onChange={e => updateLine(line.id, 'vat_rate', parseFloat(e.target.value))}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#0D3349]/30"
                        >
                          {VAT_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 font-medium">
                        £{lineTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors text-base leading-none"
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                      No line items. Click "+ Add Line" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-100 text-sm">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-slate-500">Net</td>
                  <td className="px-3 py-2 text-right text-slate-700">£{net.toFixed(2)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-slate-500">VAT</td>
                  <td className="px-3 py-2 text-right text-slate-700">£{vat.toFixed(2)}</td>
                  <td></td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={4} className="px-4 py-2.5 text-right text-slate-900">Total</td>
                  <td className="px-3 py-2.5 text-right text-slate-900">£{total.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/manager/invoices')}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-[#0D3349] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60 hover:bg-[#0D3349]/90 transition-colors"
          >
            {submitting ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </form>

      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
