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
  Contract,
  ContractVisit,
  Device,
  DeviceTest,
  Quote,
  QuoteLine,
  PriceListItem,
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
  contracts!: Table<Contract>;
  contract_visits!: Table<ContractVisit>;
  devices!: Table<Device>;
  device_tests!: Table<DeviceTest>;
  quotes!: Table<Quote>;
  quote_lines!: Table<QuoteLine>;
  price_list_items!: Table<PriceListItem>;

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
  }
}

export const db = new AppDB();
