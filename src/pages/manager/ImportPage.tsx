import { useState, useRef, useCallback } from 'react';
import { Tabs, useActiveTab } from '../../components/ui/Tabs';
import { ToastStack } from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { db } from '../../lib/db';
import { enqueueSync } from '../../offline/SyncQueue';
import { useAuth } from '../../auth/AuthProvider';
import type { Customer, Site, System, Device, SystemType } from '../../types';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const tabDefs = [
  { id: 'customers', label: 'Customers' },
  { id: 'sites',     label: 'Sites'     },
  { id: 'systems',   label: 'Systems'   },
  { id: 'devices',   label: 'Devices'   },
];

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim().replace(/^"|"$/g, '')));
  return { headers, rows };
}

// ─── Shared state shape ───────────────────────────────────────────────────────

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

// ─── Generic Import Tab component ─────────────────────────────────────────────

interface ImportTabProps {
  entityLabel?: string;
  requiredFields: string[];
  fieldOptions: string[];
  onConfirm: (mapping: Record<string, string>, rows: string[][], headers: string[]) => Promise<void>;
}

function ImportTab({ requiredFields, fieldOptions, onConfirm }: ImportTabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const result = parseCSV(text);
      setParsed(result);
      // Auto-map: if a CSV header matches a field option exactly (case-insensitive), pre-select it
      const autoMap: Record<string, string> = {};
      result.headers.forEach(h => {
        const match = fieldOptions.find(f => f.toLowerCase() === h.toLowerCase());
        if (match) autoMap[h] = match;
      });
      setMapping(autoMap);
    };
    reader.readAsText(file);
  }

  // Validation: a row has an error if any required field has no mapping or the mapped column is empty
  function getRowErrors(row: string[], headers: string[]): string[] {
    const errors: string[] = [];
    for (const req of requiredFields) {
      const csvCol = Object.entries(mapping).find(([, v]) => v === req)?.[0];
      if (!csvCol) {
        errors.push(`"${req}" column not mapped`);
      } else {
        const idx = headers.indexOf(csvCol);
        const val = idx >= 0 ? row[idx] : '';
        if (!val || val.trim() === '') {
          errors.push(`"${req}" is empty`);
        }
      }
    }
    return errors;
  }

  const previewRows  = parsed ? parsed.rows.slice(0, 10) : [];
  const allRowErrors = parsed
    ? parsed.rows.map(row => getRowErrors(row, parsed.headers))
    : [];

  const validCount   = allRowErrors.filter(e => e.length === 0).length;
  const errorCount   = allRowErrors.filter(e => e.length > 0).length;
  const hasErrors    = errorCount > 0;
  const canConfirm   = parsed && parsed.rows.length > 0 && !hasErrors && !isImporting;

  async function handleConfirm() {
    if (!parsed || !canConfirm) return;
    setIsImporting(true);
    try {
      await onConfirm(mapping, parsed.rows, parsed.headers);
      setParsed(null);
      setMapping({});
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setIsImporting(false);
    }
  }

  function getMappedValue(row: string[], headers: string[], fieldName: string): string {
    const csvCol = Object.entries(mapping).find(([, v]) => v === fieldName)?.[0];
    if (!csvCol) return '';
    const idx = headers.indexOf(csvCol);
    return idx >= 0 ? (row[idx] ?? '') : '';
  }

  // Expose getMappedValue to parent via the column mapping — keep the helper local.
  void getMappedValue;

  return (
    <div className="flex flex-col gap-6">
      {/* File upload */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">1. Upload CSV File</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#0D3349] file:text-white hover:file:bg-[#0D3349]/90 cursor-pointer"
        />
        <p className="mt-2 text-xs text-slate-400">
          Required fields: {requiredFields.map(f => <code key={f} className="bg-slate-100 px-1 rounded">{f}</code>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}
        </p>
      </div>

      {parsed && parsed.headers.length > 0 && (
        <>
          {/* Column Mapping */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">2. Map Columns</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {parsed.headers.map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-slate-500 font-normal">{h}</span>
                          <select
                            value={mapping[h] ?? ''}
                            onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                            className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0D3349]/30 font-normal"
                          >
                            <option value="">(ignore)</option>
                            {fieldOptions.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              3. Preview (first {Math.min(10, previewRows.length)} rows)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {parsed.headers.map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {h}
                        {mapping[h] ? (
                          <span className="ml-1 text-[#0D3349] font-normal">→ {mapping[h]}</span>
                        ) : null}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => {
                    const errors = allRowErrors[ri] ?? [];
                    const hasRowError = errors.length > 0;
                    return (
                      <tr
                        key={ri}
                        className={`border-b border-slate-100 last:border-0 ${hasRowError ? 'ring-1 ring-inset ring-red-300 bg-red-50' : ''}`}
                      >
                        {parsed.headers.map((_, ci) => (
                          <td key={ci} className="px-3 py-2 text-slate-700 text-xs">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-xs">
                          {hasRowError ? (
                            <span className="text-red-600">{errors.join('; ')}</span>
                          ) : (
                            <span className="text-green-600">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary + Confirm */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-slate-600">
                <span className="font-medium text-green-700">{validCount} rows valid</span>
                {errorCount > 0 && (
                  <span className="ml-3 font-medium text-red-600">{errorCount} rows with errors</span>
                )}
                <span className="ml-3 text-slate-400">({parsed.rows.length} total)</span>
              </div>
              <button
                disabled={!canConfirm}
                onClick={handleConfirm}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canConfirm
                    ? 'bg-[#0D3349] text-white hover:bg-[#0D3349]/90'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isImporting ? 'Importing…' : `Confirm Import (${validCount} rows)`}
              </button>
            </div>
            {hasErrors && (
              <p className="mt-3 text-xs text-red-600">
                Fix mapping errors before importing. All {errorCount} row(s) with errors will be skipped if you resolve mappings, or you must fix the CSV.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ImportPage() {
  const activeTab = useActiveTab('tab', 'customers');
  const { profile } = useAuth();
  const { toasts, addToast, removeToast } = useToast();
  const { customers } = useCustomers();
  const { sites } = useSites();

  // ── Helper: get mapped value from a row ───────────────────────────────────
  function getMapped(mapping: Record<string, string>, headers: string[], row: string[], field: string): string {
    const csvCol = Object.entries(mapping).find(([, v]) => v === field)?.[0];
    if (!csvCol) return '';
    const idx = headers.indexOf(csvCol);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  }

  // ── Customers import ─────────────────────────────────────────────────────
  const handleImportCustomers = useCallback(async (
    mapping: Record<string, string>,
    rows: string[][],
    headers: string[],
  ) => {
    if (!profile) return;
    let count = 0;
    for (const row of rows) {
      const name = getMapped(mapping, headers, row, 'name');
      if (!name) continue;
      const customer: Customer = {
        id:              crypto.randomUUID(),
        company_id:      profile.company_id,
        name,
        contact_name:    getMapped(mapping, headers, row, 'contact_name') || null,
        contact_email:   getMapped(mapping, headers, row, 'contact_email') || null,
        contact_phone:   getMapped(mapping, headers, row, 'contact_phone') || null,
        billing_address: getMapped(mapping, headers, row, 'billing_address') || null,
        notes:           getMapped(mapping, headers, row, 'notes') || null,
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      };
      await db.customers.put(customer);
      await enqueueSync({ table: 'customers', operation: 'insert', payload: customer as unknown as Record<string, unknown> });
      count++;
    }
    addToast(`Imported ${count} customer${count !== 1 ? 's' : ''} successfully.`, 'success');
  }, [profile, addToast]);

  // ── Sites import ─────────────────────────────────────────────────────────
  const handleImportSites = useCallback(async (
    mapping: Record<string, string>,
    rows: string[][],
    headers: string[],
  ) => {
    if (!profile) return;
    let count = 0;
    for (const row of rows) {
      const customerName = getMapped(mapping, headers, row, 'customer_name');
      const address      = getMapped(mapping, headers, row, 'address');
      if (!customerName || !address) continue;

      const customer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
      if (!customer) continue;

      const site: Site = {
        id:            crypto.randomUUID(),
        company_id:    profile.company_id,
        customer_id:   customer.id,
        address,
        contact_name:  getMapped(mapping, headers, row, 'contact_name') || null,
        contact_phone: getMapped(mapping, headers, row, 'contact_phone') || null,
        access_notes:  getMapped(mapping, headers, row, 'access_notes') || null,
        arc_name:      getMapped(mapping, headers, row, 'arc_name') || null,
        arc_account:   getMapped(mapping, headers, row, 'arc_account') || null,
        police_urn:    getMapped(mapping, headers, row, 'police_urn') || null,
        hazards:       getMapped(mapping, headers, row, 'hazards') || null,
        keyholders:    [],
        created_at:    new Date().toISOString(),
      };
      await db.sites.put(site);
      await enqueueSync({ table: 'sites', operation: 'insert', payload: site as unknown as Record<string, unknown> });
      count++;
    }
    addToast(`Imported ${count} site${count !== 1 ? 's' : ''} successfully.`, 'success');
  }, [profile, customers, addToast]);

  // ── Systems import ───────────────────────────────────────────────────────
  const handleImportSystems = useCallback(async (
    mapping: Record<string, string>,
    rows: string[][],
    headers: string[],
  ) => {
    if (!profile) return;
    let count = 0;
    for (const row of rows) {
      const siteAddress = getMapped(mapping, headers, row, 'site_address');
      const type        = getMapped(mapping, headers, row, 'type');
      if (!siteAddress || !type) continue;

      const site = sites.find(s => s.address.toLowerCase() === siteAddress.toLowerCase());
      if (!site) continue;

      const system: System = {
        id:             crypto.randomUUID(),
        site_id:        site.id,
        company_id:     profile.company_id,
        type:           type as SystemType,
        make:           getMapped(mapping, headers, row, 'make') || null,
        model:          getMapped(mapping, headers, row, 'model') || null,
        panel_location: getMapped(mapping, headers, row, 'panel_location') || null,
        notes:          getMapped(mapping, headers, row, 'notes') || null,
        zones_count:    null,
        loops_count:    null,
        num_cameras:    null,
        retention_days: null,
        grade:          null,
        created_at:     new Date().toISOString(),
      };
      await db.systems.put(system);
      await enqueueSync({ table: 'systems', operation: 'insert', payload: system as unknown as Record<string, unknown> });
      count++;
    }
    addToast(`Imported ${count} system${count !== 1 ? 's' : ''} successfully.`, 'success');
  }, [profile, sites, addToast]);

  // ── Devices import ───────────────────────────────────────────────────────
  const handleImportDevices = useCallback(async (
    mapping: Record<string, string>,
    rows: string[][],
    headers: string[],
  ) => {
    if (!profile) return;
    let count = 0;
    for (const row of rows) {
      const siteAddress = getMapped(mapping, headers, row, 'site_address');
      const type        = getMapped(mapping, headers, row, 'type');
      if (!siteAddress || !type) continue;

      const site = sites.find(s => s.address.toLowerCase() === siteAddress.toLowerCase());
      if (!site) continue;

      const device: Device = {
        id:             crypto.randomUUID(),
        site_id:        site.id,
        company_id:     profile.company_id,
        system_id:      null,
        type,
        location:       getMapped(mapping, headers, row, 'location') || null,
        make:           getMapped(mapping, headers, row, 'make') || null,
        model:          getMapped(mapping, headers, row, 'model') || null,
        serial_number:  getMapped(mapping, headers, row, 'serial_number') || null,
        install_date:   getMapped(mapping, headers, row, 'install_date') || null,
        qr_code:        getMapped(mapping, headers, row, 'qr_code') || null,
        notes:          getMapped(mapping, headers, row, 'notes') || null,
        created_at:     new Date().toISOString(),
      };
      await db.devices.put(device);
      await enqueueSync({ table: 'devices', operation: 'insert', payload: device as unknown as Record<string, unknown> });
      count++;
    }
    addToast(`Imported ${count} device${count !== 1 ? 's' : ''} successfully.`, 'success');
  }, [profile, sites, addToast]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0D3349] mb-2">Import Data</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload CSV files to bulk-import customers, sites, systems, and devices.
        Data is saved locally and synced to the server when online.
      </p>

      <div className="mb-6">
        <Tabs tabs={tabDefs} paramName="tab" defaultTab="customers" />
      </div>

      {activeTab === 'customers' && (
        <ImportTab
          requiredFields={['name']}
          fieldOptions={['name', 'contact_name', 'contact_email', 'contact_phone', 'billing_address', 'notes']}
          onConfirm={handleImportCustomers}
        />
      )}

      {activeTab === 'sites' && (
        <ImportTab
          requiredFields={['customer_name', 'address']}
          fieldOptions={['customer_name', 'address', 'contact_name', 'contact_phone', 'access_notes', 'arc_name', 'arc_account', 'police_urn', 'hazards']}
          onConfirm={handleImportSites}
        />
      )}

      {activeTab === 'systems' && (
        <ImportTab
          requiredFields={['site_address', 'type']}
          fieldOptions={['site_address', 'type', 'make', 'model', 'panel_location', 'notes']}
          onConfirm={handleImportSystems}
        />
      )}

      {activeTab === 'devices' && (
        <ImportTab
          requiredFields={['site_address', 'type']}
          fieldOptions={['site_address', 'type', 'location', 'make', 'model', 'serial_number', 'install_date', 'qr_code', 'notes']}
          onConfirm={handleImportDevices}
        />
      )}

      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
