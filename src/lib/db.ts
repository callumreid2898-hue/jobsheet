import Dexie, { type Table } from 'dexie';
import type {
  Company,
  Profile,
  Customer,
  Site,
  System,
  Job,
  JobLine,
  Jobsheet,
  Remedial,
  SyncQueueItem,
  Photo,
  LocalBlob,
  Contract,
  ContractVisit,
  Device,
  DeviceTest,
  Quote,
  QuoteLine,
  PriceListItem,
  Invoice,
  InvoiceLine,
} from '../types';

export class AppDB extends Dexie {
  companies!: Table<Company>;
  profiles!: Table<Profile>;
  customers!: Table<Customer>;
  sites!: Table<Site>;
  systems!: Table<System>;
  jobs!: Table<Job>;
  job_lines!: Table<JobLine>;
  jobsheets!: Table<Jobsheet>;
  photos!: Table<Photo>;
  blobs!: Table<LocalBlob>;
  remedials!: Table<Remedial>;
  sync_queue!: Table<SyncQueueItem>;
  contracts!: Table<Contract>;
  contract_visits!: Table<ContractVisit>;
  devices!: Table<Device>;
  device_tests!: Table<DeviceTest>;
  quotes!: Table<Quote>;
  quote_lines!: Table<QuoteLine>;
  price_list_items!: Table<PriceListItem>;
  invoices!: Table<Invoice>;
  invoice_lines!: Table<InvoiceLine>;

  constructor() {
    super('jobsheet-pwa');

    this.version(1).stores({
      companies: 'id, name',
      profiles: 'id, user_id, company_id, role',
      customers: 'id, company_id, name',
      sites: 'id, company_id, customer_id',
      systems: 'id, site_id, company_id, type',
      jobs: 'id, company_id, site_id, assigned_engineer_id, scheduled_date, status, template_id',
      jobsheets: 'id, job_id, company_id, template_id, submitted_at, updated_at',
      photos: 'id, jobsheet_id, company_id',
      remedials: 'id, jobsheet_id, site_id, company_id, status, priority',
      sync_queue: 'id, table, operation, created_at, attempts',
    });

    this.version(2).stores({
      contracts:        'id, company_id, site_id, status',
      contract_visits:  'id, contract_id, company_id, status, scheduled_date',
      devices:          'id, site_id, company_id, qr_code',
      device_tests:     'id, device_id, jobsheet_id',
      quotes:           'id, company_id, site_id, remedial_id, status',
      quote_lines:      'id, quote_id',
      price_list_items: 'id, company_id',
    });

    this.version(3).stores({
      jobs:          'id, company_id, site_id, assigned_engineer_id, scheduled_date, status, template_id, type',
      job_lines:     'id, job_id, company_id',
      invoices:      'id, company_id, customer_id, site_id, job_id, quote_id, status, due_date',
      invoice_lines: 'id, invoice_id, company_id',
    });

    this.version(4).stores({
      jobs: 'id, company_id, site_id, assigned_engineer_id, scheduled_date, scheduled_time, status, template_id, type',
    });

    // Older items can't be attributed to a user, so they wait on the Sync screen for a retry or discard.
    this.version(5).stores({
      sync_queue: 'id, table, operation, created_at, attempts, seq, status, user_id, entity_key',
    }).upgrade(async tx => {
      const items = await tx.table('sync_queue').orderBy('created_at').toArray();
      let seq = 0;
      for (const item of items) {
        const id = item.payload?.id ?? item.payload?.blob_key ?? item.id;
        await tx.table('sync_queue').update(item.id, {
          seq: ++seq,
          user_id: null,
          company_id: item.payload?.company_id ?? null,
          status: item.attempts >= 5 ? 'failed' : 'pending',
          next_attempt_at: null,
          entity_key: `${item.table}:${id}`,
          depends_on: [],
        });
      }
    });

    // Photo and signature files until they're uploaded (keyed by storage path).
    this.version(6).stores({
      blobs: 'id, jobsheet_id',
    });
  }
}

export const db = new AppDB();

/** Wipes every local table and the legacy Workbox API cache (used on sign-out). */
export async function clearLocalData(): Promise<void> {
  await db.delete({ disableAutoOpen: false });
  await db.open();
  if (typeof caches !== 'undefined') await caches.delete('supabase-cache').catch(() => false);
}
