import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import type { Customer, Site, Job, Quote, Invoice, Device } from '../../types';
import { FEATURES } from '../../lib/features';

// ─── Result Types ─────────────────────────────────────────────────────────────

type ResultKind = 'customer' | 'site' | 'job' | 'quote' | 'invoice' | 'device';

interface SearchResult {
  kind: ResultKind;
  id: string;
  primary: string;
  secondary?: string;
  /** For device navigation we need site_id */
  site_id?: string;
}

interface GroupedResults {
  customers: SearchResult[];
  sites: SearchResult[];
  jobs: SearchResult[];
  quotes: SearchResult[];
  invoices: SearchResult[];
  devices: SearchResult[];
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconCpu() {
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 3H7a2 2 0 00-2 2v2M9 3h6M9 3v2m6-2h2a2 2 0 012 2v2m0 0v6m0-6H3m18 0v6m0 0v2a2 2 0 01-2 2h-2m0 0H9m6 0v2M9 21H7a2 2 0 01-2-2v-2m0 0V9M3 15h18" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 text-slate-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── Kind metadata ────────────────────────────────────────────────────────────

const KIND_META: Record<ResultKind, { label: string; icon: () => ReactElement }> = {
  customer: { label: 'Customers', icon: IconUsers },
  site:     { label: 'Sites',     icon: IconMapPin },
  job:      { label: 'Jobs',      icon: IconBriefcase },
  quote:    { label: 'Quotes',    icon: IconFileText },
  invoice:  { label: 'Invoices',  icon: IconReceipt },
  device:   { label: 'Devices',   icon: IconCpu },
};

const GROUP_ORDER: ResultKind[] = ['customer', 'site', 'job', 'quote', 'invoice', 'device'];

// ─── Search logic ─────────────────────────────────────────────────────────────

async function runSearch(q: string): Promise<GroupedResults> {
  const [customers, sites, jobs, quotes, invoices, devices] = await Promise.all([
    db.customers
      .filter((c: Customer) => c.name.toLowerCase().includes(q))
      .limit(4)
      .toArray(),
    db.sites
      .filter((s: Site) => `${s.name} ${s.address} ${(s.job_codes ?? []).join(' ')}`.toLowerCase().includes(q))
      .limit(4)
      .toArray(),
    db.jobs
      .filter((j: Job) => j.id.includes(q))
      .limit(4)
      .toArray(),
    FEATURES.quotes ? db.quotes
      .filter((q2: Quote) => q2.reference.toLowerCase().includes(q))
      .limit(4)
      .toArray() : [],
    FEATURES.invoices ? db.invoices
      .filter((i: Invoice) => i.reference.toLowerCase().includes(q))
      .limit(4)
      .toArray() : [],
    db.devices
      .filter((d: Device) =>
        (d.serial_number ?? '').toLowerCase().includes(q) ||
        (d.location ?? '').toLowerCase().includes(q)
      )
      .limit(4)
      .toArray(),
  ]);

  return {
    customers: customers.map((c: Customer) => ({
      kind: 'customer' as ResultKind,
      id: c.id,
      primary: c.name,
      secondary: c.contact_name ?? undefined,
    })),
    sites: sites.map((s: Site) => ({
      kind: 'site' as ResultKind,
      id: s.id,
      primary: s.name,
    })),
    jobs: jobs.map((j: Job) => ({
      kind: 'job' as ResultKind,
      id: j.id,
      primary: j.id.slice(0, 8),
      secondary: j.status,
    })),
    quotes: quotes.map((q2: Quote) => ({
      kind: 'quote' as ResultKind,
      id: q2.id,
      primary: q2.reference,
    })),
    invoices: invoices.map((i: Invoice) => ({
      kind: 'invoice' as ResultKind,
      id: i.id,
      primary: i.reference,
    })),
    devices: devices.map((d: Device) => ({
      kind: 'device' as ResultKind,
      id: d.id,
      primary: d.serial_number ?? d.location ?? d.id.slice(0, 8),
      site_id: d.site_id,
    })),
  };
}

function totalResults(grouped: GroupedResults): number {
  return (
    grouped.customers.length +
    grouped.sites.length +
    grouped.jobs.length +
    grouped.quotes.length +
    grouped.invoices.length +
    grouped.devices.length
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults(null);
  }, []);

  // Ctrl+K / Cmd+K opens modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Debounced search — 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const grouped = await runSearch(trimmed);
        setResults(grouped);
      } catch {
        setResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function navigateTo(result: SearchResult) {
    handleClose();
    const isManager = !profile || profile.role === 'manager';

    switch (result.kind) {
      case 'customer':
        navigate(`/manager/customers/${result.id}`);
        break;
      case 'site':
        navigate(`/manager/sites/${result.id}`);
        break;
      case 'job':
        navigate(isManager ? `/manager/jobs/${result.id}` : `/jobs/${result.id}`);
        break;
      case 'quote':
        navigate(`/manager/quotes/${result.id}`);
        break;
      case 'invoice':
        navigate(`/manager/invoices/${result.id}`);
        break;
      case 'device':
        navigate(`/devices/${result.id}`);
        break;
    }
  }

  if (!open) return null;

  const trimmed = query.trim();
  const hasMinLength = trimmed.length >= 2;
  const hasResults = results !== null && totalResults(results) > 0;
  const showNoResults = hasMinLength && !isSearching && results !== null && !hasResults;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-4 top-20 z-50 max-w-xl mx-auto bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          {isSearching ? <Spinner /> : <IconSearch />}
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={FEATURES.invoices ? "Search customers, sites, jobs, invoices…" : "Search customers, sites, job codes…"}
            className="flex-1 text-sm outline-none placeholder-slate-400"
          />
          <kbd className="hidden sm:inline text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Prompt */}
          {!hasMinLength && (
            <div className="p-3 text-sm text-slate-400 text-center py-8">
              Start typing to search
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="p-3 text-sm text-slate-400 text-center py-8">
              No results for &ldquo;{trimmed}&rdquo;
            </div>
          )}

          {/* Results grouped */}
          {hasResults && results && (
            <div className="py-2">
              {GROUP_ORDER.map(kind => {
                const group = results[`${kind}s` as keyof GroupedResults] as SearchResult[];
                if (!group.length) return null;
                const meta = KIND_META[kind];
                const Icon = meta.icon;
                return (
                  <div key={kind} className="mb-1">
                    <div className="px-4 py-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                      {meta.label}
                    </div>
                    {group.map(result => (
                      <button
                        key={result.id}
                        onClick={() => navigateTo(result)}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                      >
                        <Icon />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {result.primary}
                          </div>
                          {result.secondary && (
                            <div className="text-xs text-slate-500 truncate">
                              {result.secondary}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
