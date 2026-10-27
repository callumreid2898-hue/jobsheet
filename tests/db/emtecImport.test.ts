import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { createDb } from './harness';

// supabase/scripts/emtec_reset_and_import.sql against the real migrations:
// wipes only the named company, keeps its people, loads the 49 Emtec sites.

const SCRIPT = readFileSync(join(process.cwd(), 'supabase', 'scripts', 'emtec_reset_and_import.sql'), 'utf8');
const EMTEC = '00000000-0000-4000-8000-00000000e000';
const OTHER = '00000000-0000-4000-8000-00000000f000';

async function seedCompany(db: PGlite, co: string, name: string, n: string) {
  await db.exec(`
    insert into companies (id, name) values ('${co}', '${name}');
    insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000${n}1', 'u${n}@test.local');
    insert into profiles (id, user_id, company_id, role, full_name, email)
      values ('00000000-0000-4000-8000-0000000000${n}2', '00000000-0000-4000-8000-0000000000${n}1', '${co}', 'manager', 'M', 'u${n}@test.local')
      on conflict (user_id) do update set company_id = excluded.company_id;
    insert into customers (id, company_id, name) values ('00000000-0000-4000-8000-0000000000${n}3', '${co}', 'Old customer');
    insert into sites (id, company_id, customer_id, name, address)
      values ('00000000-0000-4000-8000-0000000000${n}4', '${co}', '00000000-0000-4000-8000-0000000000${n}3', 'Old site', '1 Old St');
    insert into jobs (id, company_id, site_id, type, template_id, scheduled_date, status)
      values ('00000000-0000-4000-8000-0000000000${n}5', '${co}', '00000000-0000-4000-8000-0000000000${n}4', 'reactive_callout', 'corrective_maintenance', '2026-10-27', 'unassigned');
    insert into jobsheets (id, job_id, company_id, template_id)
      values ('00000000-0000-4000-8000-0000000000${n}6', '00000000-0000-4000-8000-0000000000${n}5', '${co}', 'corrective_maintenance');
  `);
}

const count = async (db: PGlite, table: string, co: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where company_id = $1`, [co])).rows[0].n;

describe('emtec_reset_and_import.sql', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
    await seedCompany(db, EMTEC, 'Emtec Fire Systems', 'a');
    await seedCompany(db, OTHER, 'Other Co', 'b');
    await db.exec(SCRIPT);
  }, 60_000);

  it('replaces the company\'s sites and customers with the spreadsheet', async () => {
    expect(await count(db, 'sites', EMTEC)).toBe(49);
    expect(await count(db, 'customers', EMTEC)).toBe(42); // Strathberry, SAICA, SQA, AK Stoddart grouped
    expect(await count(db, 'jobs', EMTEC)).toBe(0);
    expect(await count(db, 'jobsheets', EMTEC)).toBe(0);
    expect(await count(db, 'audit_log', EMTEC)).toBe(0);
    expect(await count(db, 'profiles', EMTEC)).toBe(1);

    const svs = (await db.query<{ name: string; address: string; job_codes: string[]; customer: string }>(
      `select s.name, s.address, s.job_codes, c.name as customer from sites s join customers c on c.id = s.customer_id
       where s.company_id = $1 and s.name like '250%'`, [EMTEC])).rows[0];
    expect(svs).toEqual({ name: '250 St Vincent St (250 SVS)', address: '250 St Vincent Street, Glasgow', job_codes: ['FS5104'], customer: '250 St Vincent St (250 SVS)' });

    const murieston = (await db.query<{ job_codes: string[] }>(`select job_codes from sites where name = 'CRM Murieston'`)).rows[0];
    expect(murieston.job_codes).toEqual(['FS1178', 'FS1178/4', 'FS1178/5', 'FS1178/6', 'FS1178/8', 'FS1178/9']);

    const strathberry = (await db.query<{ n: number }>(
      `select count(*)::int as n from sites s join customers c on c.id = s.customer_id where c.name = 'Strathberry'`)).rows[0];
    expect(strathberry.n).toBe(3);
    expect((await db.query(`select 1 from sites where name = 'St Kilda''s' and address = ''`)).rows).toHaveLength(1);
  });

  it('leaves other companies alone', async () => {
    expect(await count(db, 'sites', OTHER)).toBe(1);
    expect(await count(db, 'jobs', OTHER)).toBe(1);
    expect(await count(db, 'jobsheets', OTHER)).toBe(1);
  });

  it('changes nothing when the company name doesn\'t match', async () => {
    const other = await createDb();
    await seedCompany(other, OTHER, 'Other Co', 'b');
    await expect(other.exec(SCRIPT)).rejects.toThrow(/No company named "Emtec Fire Systems"\. Companies here: "Other Co"/);
    expect(await count(other, 'sites', OTHER)).toBe(1);
  }, 60_000);
});

describe('emtec_staff_invites.sql', () => {
  const STAFF = readFileSync(join(process.cwd(), 'supabase', 'scripts', 'emtec_staff_invites.sql'), 'utf8');
  let db: PGlite;
  const invites = async () => (await db.query<{ email: string; role: string; full_name: string }>(
    `select email, role, full_name from invites where company_id = $1 and accepted_at is null order by email`, [EMTEC])).rows;

  beforeAll(async () => {
    db = await createDb();
    await db.exec(`insert into companies (id, name) values ('${EMTEC}', 'Emtec Fire Systems')`);
    // Already in the team, signed in with the googlemail spelling of their gmail address
    await db.exec(`
      insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'callumreid2898@googlemail.com');
      insert into profiles (user_id, company_id, role, full_name, email)
        values ('00000000-0000-4000-8000-0000000000c1', '${EMTEC}', 'manager', 'Callum', 'callumreid2898@googlemail.com')
        on conflict (user_id) do update set company_id = excluded.company_id, role = excluded.role, full_name = excluded.full_name;
    `);
    await db.exec(STAFF);
  }, 60_000);

  it('invites everyone not already in the company, with their role', async () => {
    const rows = await invites();
    expect(rows).toHaveLength(12);
    expect(rows.map(r => r.email)).not.toContain('callumreid2898@gmail.com');
    expect(rows.filter(r => r.role === 'manager').map(r => r.full_name).sort())
      .toEqual(['Ross Sloan', 'Shane Garrioch', 'Stephanie Lister']);
    expect(rows.find(r => r.full_name === 'Lewis Sloan')).toMatchObject({ role: 'engineer', email: 'lewissloan2004@gmail.com' });
    expect(rows.find(r => r.full_name === 'Aidan Butler')!.email).toBe('aidan.butler@emtecgroup.co.uk'); // first of two
  });

  it('is safe to run again', async () => {
    await db.exec(STAFF);
    expect(await invites()).toHaveLength(12);
  });

  it('a new sign-in with an invited email joins the company with that role', async () => {
    await db.exec(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c2', 'Ross.Sloan@emtecgroup.co.uk')`);
    const p = (await db.query<{ company_id: string; role: string; full_name: string }>(
      `select company_id, role, full_name from profiles where user_id = '00000000-0000-4000-8000-0000000000c2'`)).rows[0];
    expect(p).toEqual({ company_id: EMTEC, role: 'manager', full_name: 'Ross Sloan' });
    expect(await invites()).toHaveLength(11);
  });
});
