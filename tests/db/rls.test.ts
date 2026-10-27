// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb, as } from './harness';
import { advanceDue } from '../../src/lib/contracts';
import type { VisitFrequency } from '../../src/types';

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

  it('the assigned engineer can edit until submitted; afterwards only the PDF and signature paths', async () => {
    await as(db, U.engA, () => db.query(
      `update jobsheets set answers = '{"a":1}', submitted_at = now() where id = '${JS1}'`));
    await expect(as(db, U.engA, () => db.query(`update jobsheets set answers = '{"a":2}' where id = '${JS1}'`)))
      .rejects.toThrow(/read-only/);
    await as(db, U.engA, () => db.query(
      `update jobsheets set pdf_path = 'p', customer_signature_url = 's' where id = '${JS1}'`));
    expect(await rows(`select answers, pdf_path, customer_signature_url from jobsheets where id = '${JS1}'`))
      .toEqual([{ answers: { a: 1 }, pdf_path: 'p', customer_signature_url: 's' }]);
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

describe('photos', () => {
  const PH1 = '00000000-0000-0000-0007-000000000001';
  const photoRow = (id: string, js: string) => `insert into photos (id, jobsheet_id, company_id, storage_path)
    values ('${id}', '${js}', '${CO_A}', '${CO_A}/${js}/${id}.jpg') on conflict (id) do nothing`;
  const upload = (path: string) => `insert into storage.objects (bucket_id, name) values ('photos', '${path}')`;

  it('the assigned engineer can add photo rows to their jobsheet only', async () => {
    await as(db, U.engA, () => db.query(photoRow(PH1, JS1)));
    await as(db, U.engA, () => db.query(photoRow(PH1, JS1))); // a retried insert is fine
    await expect(as(db, U.engA, () => db.query(photoRow('00000000-0000-0000-0007-000000000002', JS2))))
      .rejects.toThrow(/row-level security/);
  });

  it("other engineers can't see the photos; managers can; engineers can't delete", async () => {
    expect(await as(db, U.engA2, () => count(`select count(*)::int n from photos where id = '${PH1}'`))).toBe(0);
    expect(await as(db, U.mgrA, () => count(`select count(*)::int n from photos where id = '${PH1}'`))).toBe(1);
    expect(await as(db, U.mgrB, () => count(`select count(*)::int n from photos`))).toBe(0);
    expect((await as(db, U.engA, () => db.query(`delete from photos where id = '${PH1}'`))).affectedRows).toBe(0);
  });

  it('photo and signature files: only under the assigned jobsheet', async () => {
    await as(db, U.engA, () => db.query(upload(`${CO_A}/${JS1}/${PH1}.jpg`)));
    await as(db, U.engA, () => db.query(upload(`${CO_A}/${JS1}/signatures/engineer.png`)));
    await expect(as(db, U.engA, () => db.query(upload(`${CO_A}/${JS2}/x.jpg`)))).rejects.toThrow(/row-level security/);
    await expect(as(db, U.engA, () => db.query(upload(`${CO_B}/${JS1}/x.jpg`)))).rejects.toThrow(/row-level security/);
    expect(await as(db, U.engA2, () => count(`select count(*)::int n from storage.objects where bucket_id = 'photos'`))).toBe(0);
    expect(await as(db, U.mgrA, () => count(`select count(*)::int n from storage.objects where bucket_id = 'photos'`))).toBe(2);
  });

  it('a retried upload (upsert) can overwrite; only managers delete', async () => {
    const res = await as(db, U.engA, () => db.query(
      `update storage.objects set name = name where bucket_id = 'photos' and name = '${CO_A}/${JS1}/${PH1}.jpg'`));
    expect(res.affectedRows).toBe(1);
    expect((await as(db, U.engA, () => db.query(`delete from storage.objects where bucket_id = 'photos'`))).affectedRows).toBe(0);
    expect((await as(db, U.mgrA, () => db.query(
      `delete from storage.objects where bucket_id = 'photos' and name like '%/signatures/%'`))).affectedRows).toBe(1);
  });
});

describe('job activity log (00012)', () => {
  const J = '00000000-0000-0000-0002-0000000000aa';
  const acts = async () => (await db.query<{ action: string; user_id: string }>(`select action, user_id from audit_log where entity_id = '${J}' order by created_at, action`)).rows;

  it('logs creation, assignment and status changes with who did them', async () => {
    await as(db, U.mgrA, () => db.query(`insert into jobs (id, company_id, site_id, type, template_id, scheduled_date, status)
      values ('${J}', '${CO_A}', '00000000-0000-0000-0005-00000000000a', 'reactive_callout', 'reactive_callout', '2026-10-26', 'unassigned')`));
    await as(db, U.mgrA, () => db.query(`update jobs set assigned_engineer_id = '${P.engA}', status = 'scheduled' where id = '${J}'`));
    await as(db, U.mgrA, () => db.query(`update jobs set notes = 'gate code 1234' where id = '${J}'`)); // not logged
    await as(db, U.engA, () => db.query(`select set_job_status('${J}', 'travelling')`));

    expect((await acts()).map(r => [r.action, r.user_id]).sort()).toEqual([
      ['job_assigned', U.mgrA],
      ['job_created', U.mgrA],
      ['job_status:scheduled', U.mgrA],
      ['job_status:travelling', U.engA],
    ].sort());
  });

  it('writes with no signed-in user (service role) are not logged', async () => {
    const before = (await acts()).length;
    await db.query(`update jobs set status = 'cancelled' where id = '${J}'`);
    expect((await acts()).length).toBe(before);
  });

  it('engineers cannot read the log', async () => {
    expect(await as(db, U.engA, () => count(`select count(*)::int n from audit_log where entity_id = '${J}'`))).toBe(0);
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

describe('team (00013)', () => {
  const NEW = '00000000-0000-0000-0000-0000000000f1';
  const INVITED = '00000000-0000-0000-0000-0000000000f2';
  const J = '00000000-0000-0000-0002-0000000000bb';
  const one = async <T,>(uid: string, sql: string) => (await as(db, uid, () => db.query<T>(sql))).rows[0];

  it('a user with no profile and no invite can create a company and becomes its manager, once', async () => {
    await db.query(`insert into auth.users (id, email) values ('${NEW}', 'founder@new.test')`);
    const { create_company_and_manager: co } = await one<{ create_company_and_manager: string }>(NEW,
      `select create_company_and_manager('New Fire Ltd', 'Fran Founder')`);
    expect(await rows(`select name from companies where id = '${co}'`)).toEqual([{ name: 'New Fire Ltd' }]);
    expect(await rows(`select company_id, role, full_name, email from profiles where user_id = '${NEW}'`))
      .toEqual([{ company_id: co, role: 'manager', full_name: 'Fran Founder', email: 'founder@new.test' }]);
    await expect(as(db, NEW, () => db.query(`select create_company_and_manager('Second', '')`)))
      .rejects.toThrow(/already belong/);
  });

  it('someone with a pending invite joins that company instead of creating one', async () => {
    await db.query(`insert into auth.users (id, email) values ('${INVITED}', 'invited@a.test')`);
    await as(db, U.mgrA, () => db.query(`insert into invites (company_id, email) values ('${CO_A}', 'invited@a.test')`));
    await expect(as(db, INVITED, () => db.query(`select create_company_and_manager('Mine', '')`)))
      .rejects.toThrow(/pending invite/);
    expect((await one<{ claim_invite: boolean }>(INVITED, `select claim_invite()`)).claim_invite).toBe(true);
    expect(await rows(`select company_id from profiles where user_id = '${INVITED}'`)).toEqual([{ company_id: CO_A }]);
  });

  it('removing a member shuts them out, hands back their unfinished jobs, and they can still see they were removed', async () => {
    await db.exec(`
      insert into jobs (id, company_id, site_id, type, template_id, assigned_engineer_id, scheduled_date, status) values
        ('${J}', '${CO_A}', '00000000-0000-0000-0005-00000000000a', 'reactive_callout', 'reactive_callout', '${P.engA2}', '2026-10-26', 'on_site')`);
    const { remove_member: n } = await one<{ remove_member: number }>(U.mgrA, `select remove_member('${P.engA2}')`);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await rows(`select assigned_engineer_id, status from jobs where id = '${J}'`))
      .toEqual([{ assigned_engineer_id: null, status: 'unassigned' }]);

    expect((await one<{ c: string | null }>(U.engA2, `select get_my_company_id() c`)).c).toBeNull();
    expect(await as(db, U.engA2, () => count(`select count(*)::int n from jobs`))).toBe(0);
    expect(await as(db, U.engA2, () => rows(`select active from profiles`))).toEqual([{ active: false }]);
    // The rest of the company still sees them (greyed out on the Team page)
    expect(await as(db, U.mgrA, () => rows(`select active from profiles where id = '${P.engA2}'`))).toEqual([{ active: false }]);
  });

  it('restore_member gives access back', async () => {
    await as(db, U.mgrA, () => db.query(`select restore_member('${P.engA2}')`));
    expect((await one<{ c: string }>(U.engA2, `select get_my_company_id() c`)).c).toBe(CO_A);
  });

  it('only managers manage members, only in their own company, and not themselves', async () => {
    await expect(as(db, U.engA, () => db.query(`select remove_member('${P.engA2}')`))).rejects.toThrow(/only managers/);
    await expect(as(db, U.mgrB, () => db.query(`select remove_member('${P.engA}')`))).rejects.toThrow(/not found/);
    await expect(as(db, U.mgrA, () => db.query(`select remove_member('${P.mgrA}')`))).rejects.toThrow(/yourself/);
    await expect(as(db, U.engA, () => db.query(`select set_member_role('${P.engA}', 'manager')`))).rejects.toThrow(/only managers/);
    await expect(as(db, U.mgrA, () => db.query(`select managed_member('${P.engA}')`))).rejects.toThrow(/permission denied/);
  });

  it('a company always keeps a manager', async () => {
    await expect(as(db, U.mgrA, () => db.query(`select set_member_role('${P.mgrA}', 'engineer')`)))
      .rejects.toThrow(/at least one manager/);
    await as(db, U.mgrA, () => db.query(`select set_member_role('${P.engA}', 'manager')`));
    await as(db, U.mgrA, () => db.query(`select set_member_role('${P.mgrA}', 'engineer')`)); // engA is a manager now
    expect(await rows(`select role from profiles where id in ('${P.mgrA}', '${P.engA}') order by id`))
      .toEqual([{ role: 'engineer' }, { role: 'manager' }]);
    // put them back for any later tests
    await as(db, U.engA, () => db.query(`select set_member_role('${P.mgrA}', 'manager')`));
    await as(db, U.mgrA, () => db.query(`select set_member_role('${P.engA}', 'engineer')`));
    await expect(as(db, U.mgrA, () => db.query(`select set_member_role('${P.engA}', 'owner')`))).rejects.toThrow(/invalid role/);
  });
});

describe('PPM engine (00014)', () => {
  const C = '00000000-0000-0000-0008-000000000001';
  const SITE = '00000000-0000-0000-0005-00000000000a';
  const CUST = '00000000-0000-0000-0004-00000000000a';
  const gen = (uid: string, date: string, engineer: string | null = null) => as(db, uid, () =>
    db.query<{ generate_visit_job: string }>(
      `select generate_visit_job('${C}', '${date}', ${engineer ? `'${engineer}'` : 'null'})`));
  const contract = async () => (await db.query<{ next_visit_due: string | null }>(
    `select to_char(next_visit_due, 'YYYY-MM-DD') next_visit_due from contracts where id = '${C}'`)).rows[0];
  const visit = async (date: string) => (await db.query<{ status: string; job_id: string | null }>(
    `select status, job_id from contract_visits where contract_id = '${C}' and scheduled_date = '${date}'`)).rows[0];

  it('next_due_date() matches advanceDue() in the app', async () => {
    const cases: [string, VisitFrequency, string | null][] = [
      ['2026-01-31', 'monthly', null], ['2026-02-28', 'monthly', '2026-01-31'], ['2028-01-31', 'monthly', null],
      ['2026-10-20', 'quarterly', null], ['2026-04-30', 'quarterly', '2026-01-31'], ['2026-03-10', 'quarterly', '2026-01-15'],
      ['2026-10-20', 'biannual', null], ['2028-02-29', 'annual', null], ['2026-01-10', 'annual', '2026-06-01'],
    ];
    for (const [from, freq, anchor] of cases) {
      const { rows } = await db.query<{ d: string }>(
        `select to_char(next_due_date('${from}', '${freq}', ${anchor ? `'${anchor}'` : 'null'}), 'YYYY-MM-DD') d`);
      expect([from, freq, anchor, rows[0].d]).toEqual([from, freq, anchor, advanceDue(from, freq, anchor)]);
    }
  });

  it('a manager creates the visit and its PPM job once; engineers cannot', async () => {
    await db.exec(`insert into contracts (id, company_id, site_id, customer_id, system_type, visit_frequency,
        start_date, next_visit_due, reference)
      values ('${C}', '${CO_A}', '${SITE}', '${CUST}', 'emergency_lighting', 'quarterly', '2026-01-31', '2026-10-31', 'EL-1')`);
    await expect(gen(U.engA, '2026-10-31')).rejects.toThrow(/only managers/);
    await expect(gen(U.mgrB, '2026-10-31')).rejects.toThrow(/not found/);

    const job = (await gen(U.mgrA, '2026-10-31', P.engA)).rows[0].generate_visit_job;
    expect((await gen(U.mgrA, '2026-10-31', P.engA)).rows[0].generate_visit_job).toBe(job); // idempotent
    expect(await rows(`select type, template_id, status, assigned_engineer_id, notes from jobs where id = '${job}'`)).toEqual([{
      type: 'ppm_service', template_id: 'emergency_lighting_test', status: 'scheduled',
      assigned_engineer_id: P.engA, notes: 'PPM visit · EL-1',
    }]);
    expect(await visit('2026-10-31')).toEqual({ status: 'scheduled', job_id: job });
  });

  it('only one visit per date', async () => {
    await expect(db.query(`insert into contract_visits (contract_id, company_id, scheduled_date)
      values ('${C}', '${CO_A}', '2026-10-31')`)).rejects.toThrow(/duplicate key/);
  });

  it('submitting the job completes the visit and moves the contract on (keeping the start day)', async () => {
    const { job_id } = await visit('2026-10-31');
    await as(db, U.engA, () => db.query(`select set_job_status('${job_id}', 'on_site')`));
    expect((await contract()).next_visit_due).toBe('2026-10-31'); // not yet
    await as(db, U.engA, () => db.query(`select set_job_status('${job_id}', 'awaiting_review')`));
    expect(await visit('2026-10-31')).toMatchObject({ status: 'complete' });
    expect((await contract()).next_visit_due).toBe('2027-01-31');
    // Later status changes (reviewed, invoiced) don't advance it again
    await as(db, U.mgrA, () => db.query(`update jobs set status = 'reviewed' where id = '${job_id}'`));
    expect((await contract()).next_visit_due).toBe('2027-01-31');
  });

  it('a late job for an older visit does not pull the date back', async () => {
    const job = (await gen(U.mgrA, '2026-07-31', P.engA)).rows[0].generate_visit_job;
    await as(db, U.mgrA, () => db.query(`update jobs set status = 'reviewed' where id = '${job}'`));
    expect(await visit('2026-07-31')).toMatchObject({ status: 'complete' });
    expect((await contract()).next_visit_due).toBe('2027-01-31');
  });

  it('a cancelled job frees its visit for a new job', async () => {
    const job = (await gen(U.mgrA, '2027-01-31')).rows[0].generate_visit_job;
    expect(await rows(`select status from jobs where id = '${job}'`)).toEqual([{ status: 'unassigned' }]);
    await as(db, U.mgrA, () => db.query(`update jobs set status = 'cancelled' where id = '${job}'`));
    expect(await visit('2027-01-31')).toEqual({ status: 'pending', job_id: null });
    const again = (await gen(U.mgrA, '2027-01-31')).rows[0].generate_visit_job;
    expect(again).not.toBe(job);
  });

  it('no visits after the end date; paused contracts get no jobs', async () => {
    await db.exec(`update contracts set end_date = '2027-03-01' where id = '${C}'`);
    const { job_id } = await visit('2027-01-31');
    await as(db, U.mgrA, () => db.query(`update jobs set status = 'reviewed' where id = '${job_id}'`));
    expect((await contract()).next_visit_due).toBeNull(); // 30 Apr would be after the end
    await db.exec(`update contracts set status = 'paused' where id = '${C}'`);
    await expect(gen(U.mgrA, '2027-04-30')).rejects.toThrow(/paused/);
  });
});

