import Dexie, { type Table } from 'dexie';
import type {
  Company,
  Profile,
  Customer,
  Site,
  System,
  Job,
  Jobsheet,
  Remedial,
  SyncQueueItem,
  PhotoLocal,
} from '../types';

export class AppDB extends Dexie {
  companies!: Table<Company>;
  profiles!: Table<Profile>;
  customers!: Table<Customer>;
  sites!: Table<Site>;
  systems!: Table<System>;
  jobs!: Table<Job>;
  jobsheets!: Table<Jobsheet>;
  photos!: Table<PhotoLocal>;
  remedials!: Table<Remedial>;
  sync_queue!: Table<SyncQueueItem>;

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
  }
}

export const db = new AppDB();
