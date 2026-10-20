import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vitest runs from the repo root.
const root = join(process.cwd(), '/');
const templatesDir = root + 'src/templates/';
const migrationsDir = root + 'supabase/migrations/';

function bundledTemplates(): { file: string; id: string }[] {
  return readdirSync(templatesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: f.replace(/\.json$/, ''), id: JSON.parse(readFileSync(templatesDir + f, 'utf8')).id }));
}

/** The template_id list from the most recent CHECK on `table`, across all migrations in order. */
function latestCheckIds(table: 'jobs' | 'jobsheets'): string[] {
  let latest: string[] = [];
  const createRe = new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`, 'g');
  const alterRe = new RegExp(`alter table ${table} add constraint ${table}_template_id_check check \\(template_id in \\(([\\s\\S]*?)\\)\\);`, 'g');
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(migrationsDir + file, 'utf8');
    for (const m of sql.matchAll(createRe)) {
      const inline = m[1].match(/template_id\s+text not null check \(template_id in \(([\s\S]*?)\)\)/);
      if (inline) latest = parseList(inline[1]);
    }
    for (const m of sql.matchAll(alterRe)) latest = parseList(m[1]);
  }
  return latest;
}

function parseList(list: string): string[] {
  return [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
}

function templateIdUnion(): string[] {
  const types = readFileSync(root + 'src/types/index.ts', 'utf8');
  const block = types.match(/export type TemplateId =([\s\S]*?);/);
  return block ? parseList(block[1]) : [];
}

describe('template ids stay consistent across JSON, TS and DB', () => {
  const templates = bundledTemplates();
  const ids = templates.map(t => t.id).sort();

  it('each template id matches its filename', () => {
    for (const t of templates) expect(t.id).toBe(t.file);
  });

  it('TemplateId union lists exactly the bundled templates', () => {
    expect(templateIdUnion()).toEqual(ids);
  });

  it.each(['jobs', 'jobsheets'] as const)('latest %s.template_id CHECK allows exactly the bundled templates', table => {
    expect(latestCheckIds(table)).toEqual(ids);
  });
});
