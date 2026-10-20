// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, as } from './harness';

// Company A (two engineers, one manager) and company B (one manager).
const CO_A = '0000000a-0000-0000-0000-000000000000';
const CO_B = '0000000b-0000-0000-0000-000000000000';
const U = {
  mgrA:  '00000000-0000-0000-0000-0000000000a1',
  engA:  '00000000-0000-0000-0000-0000000000a2',
  engA2: '00000000-0000-0000-0000-0000000000a3',
  mgrB:  '00000000-0000-0000-0000-0000000000b1',
};
const P = {
  mgrA:  '00000000-0000-0000-0001-0000000000a1',
  engA:  '00000000-0000-0000-0001-0000000000a2',
  engA2: '00000000-0000-0000-0001-0000000000a3',
  mgrB:  '00000000-0000-0000-0001-0000000000b1',
};
const JOB1 = '00000000-0000-0000-0002-000000000001'; // A, assigned engA
const JOB2 = '00000000-0000-0000-0002-000000000002'; // A, assigned engA2
const JOB_B = '00000000-0000-0000-0002-00000000000b';
const JS1 = '00000000-0000-0000-0003-000000000001';
const JS2 = '00000000-0000-0000-0003-000000000002';
const pdfPath = (js: string) => `${CO_A}/${js}/report.pdf`;

let db: PGlite;

const rows = async (sql: string) => (await db.query(sql)).rows;
const count = async (sql: string) => ((await db.query<{ n: number }>(sql)).rows[0]).n;

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    insert into companies (id, name) values ('${CO_A}', 'A'), ('${CO_B}', 'B');
    insert into auth.users (id, email) values
      ('${U.mgrA}', 'mgr@a.test'), ('${U.engA}', 'eng@a.test'),
      ('${U.engA2}', 'eng2@a.test'), ('${U.mgrB}', 'mgr@b.test');
    insert into profiles (id, user_id, company_id, role, full_name, email) values
      ('${P.mgrA}',  '${U.mgrA}',  '${CO_A}', 'manager',  'Mgr A',  'mgr@a.test'),
      ('${P.engA}',  '${U.engA}',  '${CO_A}', 'engineer', 'Eng A',  'eng@a.test'),
      ('${P.engA2}', '${U.engA2}', '${CO_A}', 'engineer', 'Eng A2', 'eng2@a.test'),
      ('${P.mgrB}',  '${U.mgrB}',  '${CO_B}', 'manager',  'Mgr B',  'mgr@b.test');
    insert into customers (id, company_id, name) values
      ('00000000-0000-0000-0004-00000000000a', '${CO_A}', 'Cust A'),
      ('00000000-0000-0000-0004-00000000000b', '${CO_B}', 'Cust B');
    insert into sites (id, company_id, customer_id, address) values
      ('00000000-0000-0000-0005-00000000000a', '${CO_A}', '00000000-0000-0000-0004-00000000000a', 'Site A'),
      ('00000000-0000-0000-0005-00000000000b', '${CO_B}', '00000000-0000-0000-0004-00000000000b', 'Site B');
    insert into jobs (id, company_id, site_id, type, template_id, assigned_engineer_id, scheduled_date, status) values
      ('${JOB1}',  '${CO_A}', '00000000-0000-0000-0005-00000000000a', 'reactive_callout', 'reactive_callout', '${P.engA}',  '2026-10-19', 'scheduled'),
      ('${JOB2}',  '${CO_A}', '00000000-0000-0000-0005-00000000000a', 'reactive_callout', 'reactive_callout', '${P.engA2}', '2026-10-19', 'scheduled'),
      ('${JOB_B}', '${CO_B}', '00000000-0000-0000-0005-00000000000b', 'reactive_callout', 'reactive_callout', null,         '2026-10-19', 'unassigned');
    insert into jobsheets (id, job_id, company_id, template_id) values
      ('${JS1}', '${JOB1}', '${CO_A}', 'reactive_callout'),
      ('${JS2}', '${JOB2}', '${CO_A}', 'reactive_callout');
    insert into quotes (company_id, site_id, reference) values ('${CO_A}', '00000000-0000-0000-0005-00000000000a', 'Q-1');
    insert into price_list_items (company_id, description) values ('${CO_A}', 'Detector');
    insert into invoices (company_id, customer_id, site_id, reference) values
      ('${CO_A}', '00000000-0000-0000-0004-00000000000a', '00000000-0000-0000-0005-00000000000a', 'INV-1');
    insert into storage.objects (bucket_id, name) values ('pdfs', '${pdfPath(JS1)}'), ('pdfs', '${pdfPath(JS2)}');
  `);
}, 120_000);

describe('profiles', () => {
  it('a user cannot change their own role', async () => {
    await expect(as(db, U.engA, () => db.query(`update profiles set role = 'manager' where user_id = '${U.engA}'`)))
      .rejects.toThrow(/permission denied/);
    expect(await rows(`select role from profiles where user_id = '${U.engA}'`)).toEqual([{ role: 'engineer' }]);
  });

  it('a user cannot move themselves to another company', async () => {
    await expect(as(db, U.engA, () => db.query(`update profiles set company_id = '${CO_B}' where user_id = '${U.engA}'`)))
      .rejects.toThrow(/permission denied/);
  });

  it('a user can still change their own name', async () => {
    await as(db, U.engA, () => db.query(`update profiles set full_name = 'Renamed' where user_id = '${U.engA}'`));
    expect(await rows(`select full_name from profiles where user_id = '${U.engA}'`)).toEqual([{ full_name: 'Renamed' }]);
  });

  it('a user without a profile cannot insert one into any company', async () => {
    const stranger = '00000000-0000-0000-0000-0000000000ff';
    await db.query(`insert into auth.users (id, email) values ('${stranger}', 'stranger@x.test')`);
    await expect(as(db, stranger, () => db.query(
      `insert into profiles (user_id, company_id, role, full_name, email)
       values ('${stranger}', '${CO_A}', 'manager', 'X', 'stranger@x.test')`)))
      .rejects.toThrow(/permission denied|row-level security/);
  });
});

describe('sign-up and invites', () => {
  it('ignores company/role in user metadata', async () => {
    const id = '00000000-0000-0000-0000-0000000000e1';
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
      ('${id}', 'attacker@x.test', '{"company_id":"${CO_A}","role":"manager"}')`);
    expect(await count(`select count(*)::int n from profiles where user_id = '${id}'`)).toBe(0);
  });

  it('creates the profile from a pending invite on sign-up', async () => {
    await as(db, U.mgrA, () => db.query(
      `insert into invites (company_id, email, role, full_name) values ('${CO_A}', 'New@A.test', 'engineer', 'New Eng')`));
    const id = '00000000-0000-0000-0000-0000000000e2';
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
      ('${id}', 'new@a.test', '{"role":"manager"}')`);
    expect(await rows(`select company_id, role, full_name from profiles where user_id = '${id}'`))
      .toEqual([{ company_id: CO_A, role: 'engineer', full_name: 'New Eng' }]);
    expect(await count(`select count(*)::int n from invites where lower(email) = 'new@a.test' and accepted_at is not null`)).toBe(1);
  });

  it('lets an existing auth user claim an invite', async () => {
    const id = '00000000-0000-0000-0000-0000000000e3';
    await db.query(`insert into auth.users (id, email) values ('${id}', 'late@a.test')`);
    await as(db, U.mgrA, () => db.query(`insert into invites (company_id, email) values ('${CO_A}', 'late@a.test')`));
    const res = await as(db, id, () => db.query<{ claim_invite: boolean }>(`select claim_invite()`));
    expect(res.rows[0].claim_invite).toBe(true);
    expect(await rows(`select role from profiles where user_id = '${id}'`)).toEqual([{ role: 'engineer' }]);
  });

  it('an engineer cannot create invites, and a manager cannot invite into another company', async () => {
    await expect(as(db, U.engA, () => db.query(`insert into invites (company_id, email) values ('${CO_A}', 'x1@a.test')`)))
      .rejects.toThrow(/row-level security/);
    await expect(as(db, U.mgrB, () => db.query(`insert into invites (company_id, email, role) values ('${CO_A}', 'x2@a.test', 'manager')`)))
      .rejects.toThrow(/row-level security/);
  });
});

describe('audit_log', () => {
  it('log_audit_event is not callable by anon or authenticated users', async () => {
    const call = `select log_audit_event('${CO_A}', '${U.engA}', 'forged', 'jobs', '${JOB1}')`;
    await expect(as(db, null, () => db.query(call))).rejects.toThrow(/permission denied/);
    await expect(as(db, U.mgrB, () => db.query(call))).rejects.toThrow(/permission denied/);
  });
});

describe('jobsheets', () => {
  it("an engineer cannot update another engineer's jobsheet", async () => {
    const res = await as(db, U.engA2, () => db.query(`update jobsheets set answers = '{"x":1}' where id = '${JS1}'`));
    expect(res.affectedRows).toBe(0);
    expect(await rows(`select answers from jobsheets where id = '${JS1}'`)).toEqual([{ answers: {} }]);
  });

  it("an engineer cannot read another engineer's jobsheet", async () => {
    expect(await as(db, U.engA2, () => count(`select count(*)::int n from jobsheets where id = '${JS1}'`))).toBe(0);
  });

  it('cannot create a jobsheet for another company’s job', async () => {
    await expect(as(db, U.mgrA, () => db.query(
      `insert into jobsheets (job_id, company_id, template_id) values ('${JOB_B}', '${CO_A}', 'reactive_callout')`)))
      .rejects.toThrow(/row-level security/);
  });

  it('the assigned engineer can edit until submitted; afterwards only the PDF link', async () => {
    await as(db, U.engA, () => db.query(
      `update jobsheets set answers = '{"a":1}', submitted_at = now() where id = '${JS1}'`));
    await expect(as(db, U.engA, () => db.query(`update jobsheets set answers = '{"a":2}' where id = '${JS1}'`)))
      .rejects.toThrow(/read-only/);
    await as(db, U.engA, () => db.query(`update jobsheets set pdf_url = 'p' where id = '${JS1}'`));
    expect(await rows(`select answers, pdf_url from jobsheets where id = '${JS1}'`)).toEqual([{ answers: { a: 1 }, pdf_url: 'p' }]);
  });

  it('submission is logged once, attributed to the submitting user', async () => {
    expect(await rows(`select user_id from audit_log where entity_id = '${JS1}' and action = 'jobsheet_submitted'`))
      .toEqual([{ user_id: U.engA }]);
  });
});

describe('jobs', () => {
  it('an engineer cannot update job columns directly', async () => {
    const res = await as(db, U.engA, () => db.query(`update jobs set status = 'invoiced' where id = '${JOB2}' or id = '${JOB1}'`));
    expect(res.affectedRows).toBe(0);
  });

  it('an engineer cannot set invoiced via set_job_status', async () => {
    await expect(as(db, U.engA, () => db.query(`select * from set_job_status('${JOB1}', 'invoiced')`)))
      .rejects.toThrow(/cannot move a job/);
  });

  it('an engineer cannot change a job assigned to someone else', async () => {
    await expect(as(db, U.engA, () => db.query(`select * from set_job_status('${JOB2}', 'travelling')`)))
      .rejects.toThrow(/job not found|not assigned/);
  });

  it('an engineer can move their job forward and timestamps are set', async () => {
    await as(db, U.engA, () => db.query(`select * from set_job_status('${JOB1}', 'travelling')`));
    await as(db, U.engA, () => db.query(`select * from set_job_status('${JOB1}', 'on_site')`));
    const [j] = await rows(`select status, travelling_at is not null t, on_site_at is not null o from jobs where id = '${JOB1}'`);
    expect(j).toEqual({ status: 'on_site', t: true, o: true });
  });

  it('a manager can set any status', async () => {
    await as(db, U.mgrA, () => db.query(`select * from set_job_status('${JOB2}', 'cancelled')`));
    expect(await rows(`select status from jobs where id = '${JOB2}'`)).toEqual([{ status: 'cancelled' }]);
  });
});

describe('financial tables', () => {
  it.each(['quotes', 'price_list_items', 'invoices'])('%s: managers only', async table => {
    expect(await as(db, U.engA, () => count(`select count(*)::int n from ${table}`))).toBe(0);
    expect(await as(db, U.mgrA, () => count(`select count(*)::int n from ${table}`))).toBe(1);
  });
});

describe('tenant isolation', () => {
  it.each(['companies', 'profiles', 'customers', 'sites', 'jobs', 'jobsheets', 'quotes', 'invoices', 'invites', 'audit_log'])(
    'company B sees none of company A in %s', async table => {
      const col = table === 'companies' ? 'id' : 'company_id';
      expect(await as(db, U.mgrB, () => count(`select count(*)::int n from ${table} where ${col} = '${CO_A}'`))).toBe(0);
    });

  it('anon cannot read tables at all', async () => {
    await expect(as(db, null, () => db.query(`select * from jobs`))).rejects.toThrow(/permission denied/);
  });
});

describe('storage: pdfs', () => {
  it('the assigned engineer can upload their report but not someone else’s', async () => {
    await as(db, U.engA, () => db.query(`insert into storage.objects (bucket_id, name) values ('pdfs', '${CO_A}/${JS1}/v2.pdf')`));
    await expect(as(db, U.engA, () => db.query(`insert into storage.objects (bucket_id, name) values ('pdfs', '${CO_A}/${JS2}/v2.pdf')`)))
      .rejects.toThrow(/row-level security/);
  });

  it('engineers cannot delete reports; managers can', async () => {
    const res = await as(db, U.engA, () => db.query(`delete from storage.objects where name = '${pdfPath(JS1)}'`));
    expect(res.affectedRows).toBe(0);
    const res2 = await as(db, U.mgrA, () => db.query(`delete from storage.objects where name = '${pdfPath(JS1)}'`));
    expect(res2.affectedRows).toBe(1);
  });

  it('another company cannot list the reports', async () => {
    expect(await as(db, U.mgrB, () => count(`select count(*)::int n from storage.objects where bucket_id = 'pdfs'`))).toBe(0);
  });
});

// What the sync queue sends when it retries an engineer's remedial insert.
describe('sync retries', () => {
  const R1 = '00000000-0000-0000-0006-000000000001';
  const insert = (conflict: string) => `insert into remedials (id, jobsheet_id, site_id, company_id, description, priority)
    values ('${R1}', '${JS1}', '00000000-0000-0000-0005-00000000000a', '${CO_A}', 'Faulty detector', 'urgent') ${conflict}`;

  it('a retried insert with ON CONFLICT DO NOTHING succeeds for an engineer', async () => {
    await as(db, U.engA, () => db.query(insert('on conflict (id) do nothing')));
    await as(db, U.engA, () => db.query(insert('on conflict (id) do nothing')));
    expect(await count(`select count(*)::int n from remedials where id = '${R1}'`)).toBe(1);
  });

  it('a retried plain upsert is rejected, which is why the queue no longer uses it', async () => {
    await expect(as(db, U.engA, () => db.query(insert(
      `on conflict (id) do update set description = excluded.description`)))).rejects.toThrow();
  });
});
