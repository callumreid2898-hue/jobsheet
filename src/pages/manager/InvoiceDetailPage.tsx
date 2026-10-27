import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { localISODate } from '../../lib/dates';
import { useInvoiceLines } from '../../hooks/useInvoiceLines';
import { RecordHeader } from '../../components/ui/RecordHeader';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { StatusPill } from '../../components/ui/StatusPill';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { ToastStack } from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import type { Invoice, InvoiceStatus, Customer, Site, Job, Quote } from '../../types';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'lines',   label: 'Lines'   },
];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="flex-1 text-sm text-slate-800">{value || '—'}</dd>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const activeTab = useActiveTab('tab', 'details');
  const { toasts, addToast, removeToast } = useToast();

  const [invoice, setInvoice]   = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [site, setSite]         = useState<Site | null>(null);
  const [job, setJob]           = useState<Job | null>(null);
  const [quote, setQuote]       = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  const { lines, isLoading: linesLoading } = useInvoiceLines(invoiceId);

  // ── Load invoice + relations ──────────────────────────────────────────────
  useEffect(() => {
    if (!invoiceId) return;
    (async () => {
      setIsLoading(true);
      try {
        const inv = await fetchOneCached<Invoice>('invoices', invoiceId);
        setInvoice(inv);
        if (!inv) return;

        const [cust, s, j, q] = await Promise.all([
          fetchOneCached<Customer>('customers', inv.customer_id),
          fetchOneCached<Site>('sites', inv.site_id),
          inv.job_id ? fetchOneCached<Job>('jobs', inv.job_id) : null,
          inv.quote_id ? fetchOneCached<Quote>('quotes', inv.quote_id) : null,
        ]);
        setCustomer(cust);
        setSite(s);
        setJob(j);
        setQuote(q);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [invoiceId]);

  // ── Status transitions ────────────────────────────────────────────────────
  async function updateStatus(newStatus: InvoiceStatus, extra?: Partial<Invoice>) {
    if (!invoice || !invoiceId) return;
    setTransitioning(true);
    const now = new Date().toISOString();
    setInvoice({ ...invoice, status: newStatus, updated_at: now, ...extra });
    try {
      // writeRecord explains queued/rejected changes itself
      const { status } = await writeRecord('invoices', 'update', { id: invoiceId, status: newStatus, updated_at: now, ...extra });
      if (status === 'saved') addToast(`Invoice marked as ${newStatus}.`, 'success');
    } catch {
      addToast("Couldn't save the change on this device.", 'error');
    } finally {
      setTransitioning(false);
    }
  }

  async function handleMarkSent() {
    await updateStatus('sent');
  }

  async function handleMarkPaid() {
    const today = localISODate();
    await updateStatus('paid', { paid_date: today });
  }

  async function handleVoid() {
    if (!window.confirm('Void this invoice? This cannot be undone.')) return;
    await updateStatus('void');
  }

  // ── Send Invoice (mailto) ─────────────────────────────────────────────────
  async function handleSendInvoice() {
    if (!invoice || !customer) return;
    const recipientName  = customer.contact_name ?? customer.name;
    const recipientEmail = customer.contact_email ?? '';
    const subject  = encodeURIComponent(`Invoice ${invoice.reference}`);
    const body     = encodeURIComponent(
      `Dear ${recipientName},\n\nPlease find your invoice ${invoice.reference} attached.\n\nThank you.`,
    );
    const mailtoUrl = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl);

    // Mark as sent if still draft
    if (invoice.status === 'draft') {
      await updateStatus('sent');
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  if (!invoice) {
    return (
      <div className="px-4 pt-8 text-center text-slate-400">
        Invoice not found.
      </div>
    );
  }

  const status = invoice.status;

  const actions = (
    <div className="flex items-center gap-2">
      {(status === 'draft' || status === 'sent') && (
        <button
          onClick={handleSendInvoice}
          disabled={transitioning}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-[#0D3349] text-[#0D3349] hover:bg-[#0D3349] hover:text-white transition-colors disabled:opacity-60"
        >
          Send Invoice
        </button>
      )}
      {status === 'draft' && (
        <button
          onClick={handleMarkSent}
          disabled={transitioning}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-[#0D3349] text-white hover:bg-[#0D3349]/90 transition-colors disabled:opacity-60"
        >
          Mark Sent
        </button>
      )}
      {status === 'sent' && (
        <button
          onClick={handleMarkPaid}
          disabled={transitioning}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
        >
          Mark Paid
        </button>
      )}
      {status !== 'void' && (
        <button
          onClick={handleVoid}
          disabled={transitioning}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
        >
          Void
        </button>
      )}
    </div>
  );

  // ── Lines tab totals ──────────────────────────────────────────────────────
  const net       = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vatAmt    = lines.reduce((s, l) => s + l.quantity * l.unit_price * l.vat_rate, 0);
  const grandTotal = net + vatAmt;

  return (
    <div className="pb-8">
      <RecordHeader
        title={invoice.reference}
        subtitle={site?.name ?? undefined}
        badge={<StatusPill status={invoice.status} kind="invoice" />}
        actions={actions}
        onBack={() => navigate('/manager/invoices')}
      />

      <Tabs tabs={TABS} paramName="tab" defaultTab="details" />

      <div className="px-4 pt-4">
        {/* ── Details tab ── */}
        {activeTab === 'details' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <dl className="px-5 py-1 divide-y divide-slate-100">
              <Row label="Customer"    value={customer?.name ?? '—'} />
              <Row label="Site"        value={site ? [site.name, site.address].filter(Boolean).join(', ') : '—'} />
              <Row label="Job"         value={job ? `${job.scheduled_date} — ${job.type.replace(/_/g, ' ')}` : '—'} />
              <Row label="Quote"       value={quote?.reference ?? (invoice.quote_id ? invoice.quote_id : '—')} />
              <Row label="Issued Date" value={fmt(invoice.issued_date)} />
              <Row label="Due Date"    value={fmt(invoice.due_date)} />
              <Row label="Paid Date"   value={fmt(invoice.paid_date)} />
              <Row label="Notes"       value={invoice.notes ?? '—'} />
            </dl>
          </div>
        )}

        {/* ── Lines tab ── */}
        {activeTab === 'lines' && (
          linesLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : lines.length === 0 ? (
            <EmptyState
              heading="No line items"
              description="This invoice has no line items yet."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Unit £</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">VAT</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map(l => {
                      const lineTotal = l.quantity * l.unit_price * (1 + l.vat_rate);
                      return (
                        <tr key={l.id}>
                          <td className="px-4 py-3 text-slate-800">{l.description}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{l.quantity}</td>
                          <td className="px-3 py-3 text-right text-slate-600">£{l.unit_price.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{Math.round(l.vat_rate * 100)}%</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-900">£{lineTotal.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 text-sm">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-right text-slate-500">Net</td>
                      <td className="px-3 py-2 text-right text-slate-700">£{net.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-right text-slate-500">VAT</td>
                      <td className="px-3 py-2 text-right text-slate-700">£{vatAmt.toFixed(2)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-4 py-2.5 text-right text-slate-900">Grand Total</td>
                      <td className="px-3 py-2.5 text-right text-slate-900">£{grandTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
