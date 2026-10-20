import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory Supabase: rows per table, files in storage, tables that are "down".
type Row = Record<string, unknown>;
const server = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  files: {} as Record<string, Blob>,
  down: new Set<string>(),
}));

vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          const run = () => (server.down.has(table)
            ? { data: null, error: { message: `${table} down` }, status: 503 }
            : { data: (server.tables[table] ?? []).filter(r => r[col] === val), error: null, status: 200 });
          return {
            maybeSingle: async () => {
              const r = run();
              return r.error ? r : { ...r, data: r.data![0] ?? null };
            },
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(run()).then(resolve, reject),
          };
        },
      }),
    }),
    storage: {
      from: () => ({
        download: async (path: string) => (server.files[path]
          ? { data: server.files[path], error: null }
          : { data: null, error: { message: 'Object not found' } }),
      }),
    },
  },
}));

import { db } from '../../src/lib/db';
import { loadReportData, PDFError } from '../../src/pdf/generatePDF';

const SIG = 'co/js/signatures/engineer.png';

beforeEach(async () => {
  await Promise.all([db.customers.clear(), db.jobsheets.clear()]);
  server.down.clear();
  server.files = { [SIG]: new Blob(['png'], { type: 'image/png' }), 'co/js/p1.jpg': new Blob(['heic'], { type: 'image/heic' }) };
  server.tables = {
    jobsheets: [{
      id: 'js', job_id: 'job', company_id: 'co', template_id: 'reactive_callout', answers: {},
      engineer_signature_url: SIG, customer_signature_url: null, submitted_at: '2026-10-20T11:00:00Z',
    }],
    jobs: [{ id: 'job', site_id: 'site', assigned_engineer_id: 'eng' }],
    sites: [{ id: 'site', customer_id: 'cust' }],
    companies: [{ id: 'co', name: 'Co' }],
    // The manager comes first: the old code picked the first profile in the company
    profiles: [
      { id: 'mgr', company_id: 'co', full_name: 'Manager' },
      { id: 'eng', company_id: 'co', full_name: 'Engineer' },
    ],
    customers: [{ id: 'cust', name: 'Server customer' }],
    photos: [
      { id: 'p2', jobsheet_id: 'js', storage_path: 'co/js/p2.jpg', created_at: '2026-10-20T10:02:00Z' },
      { id: 'p1', jobsheet_id: 'js', storage_path: 'co/js/p1.jpg', created_at: '2026-10-20T10:01:00Z' },
    ],
    remedials: [],
  };
});

describe('loadReportData', () => {
  it('uses the assigned engineer and the real template', async () => {
    const data = await loadReportData('js');
    expect(data.engineerProfile?.full_name).toBe('Engineer');
    expect(data.template.id).toBe('reactive_callout');
    expect(data.photos.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('embeds the signature from storage and leaves out images it can’t embed or find', async () => {
    const { images } = await loadReportData('js');
    expect(images[SIG]).toMatch(/^data:image\/png;base64,/);
    expect(images).not.toHaveProperty('co/js/p1.jpg'); // HEIC
    expect(images).not.toHaveProperty('co/js/p2.jpg'); // not uploaded
  });

  it('falls back to the local cache when a fetch fails', async () => {
    server.down.add('customers');
    await db.customers.put({ id: 'cust', name: 'Cached customer' } as never);
    expect((await loadReportData('js')).customer.name).toBe('Cached customer');
  });

  it('a jobsheet that exists nowhere is a permanent error', async () => {
    server.tables.jobsheets = [];
    await expect(loadReportData('js')).rejects.toMatchObject({ status: 404 });
    await expect(loadReportData('js')).rejects.toBeInstanceOf(PDFError);
  });

  it('a network failure with nothing cached stays retryable', async () => {
    server.down.add('jobsheets');
    await expect(loadReportData('js')).rejects.toMatchObject({ status: 503 });
  });
});
