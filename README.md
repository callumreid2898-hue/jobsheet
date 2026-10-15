# Jobsheet PWA

Mobile-first Progressive Web App for small UK fire and security installers. Engineers complete jobsheets on-site (offline), sign, and submit. Managers review PDFs and track remedials.

## Quick Start

### Prerequisites

- Node 20+
- A Supabase project (free tier is fine) — [supabase.com](https://supabase.com)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Apply database migrations

In your Supabase dashboard, open the SQL editor and run each file in order:

```
supabase/migrations/00001_initial_schema.sql
supabase/migrations/00002_rls_policies.sql
supabase/migrations/00003_storage_buckets.sql
supabase/migrations/00004_functions_triggers.sql
```

Then run the seed data (optional — creates demo company, users, sites, jobs):

```
supabase/seed/seed.sql
```

> **Local Supabase** (Docker): `supabase start && supabase db reset` applies migrations and seed automatically.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) on your phone or browser.

---

## 3-Minute Demo Script

This walks through the complete engineer → manager flow using the seed data.

### Seed accounts (magic-link login)

| Role | Email |
|---|---|
| Manager | `manager@acmefire.co.uk` |
| Engineer 1 | `engineer1@acmefire.co.uk` |
| Engineer 2 | `engineer2@acmefire.co.uk` |

> With local Supabase, magic-link emails appear in the Inbucket UI at http://localhost:54324.

### Step 1 — Manager creates a job (desktop)

1. Log in as `manager@acmefire.co.uk`.
2. Go to **Jobs → New Job**.
3. Select customer: **Riverside Shopping Centre**.
4. Select site, system, template (**Fire Alarm Service**), engineer (**Engineer 1**), date: today.
5. Save.

### Step 2 — Engineer fills the sheet offline (phone)

1. Open [http://localhost:5173](http://localhost:5173) on your phone.
2. Log in as `engineer1@acmefire.co.uk`.
3. You should see today's job. Tap it → **Start Job**.
4. **Turn on Airplane Mode** (simulate offline).
5. Fill the fire alarm service sheet:
   - Set the panel test to **Fail** (note: "Batteries need replacing")
   - Add 2 photos from the camera roll
   - Sign as engineer
   - Ask a colleague to sign as customer
6. Tap **Submit Jobsheet**.
7. You'll see **"Saved Offline — 3 items queued"**.

### Step 3 — Sync back online

1. **Turn Airplane Mode off**.
2. The amber banner at the top should briefly show "Syncing…" then "All synced ✓".

### Step 4 — Manager reviews (desktop)

1. Back on the desktop, go to **Jobs**.
2. Find the job — status is now **Submitted**.
3. Click **Review** — see the read-only form, photos, and the auto-created remedial (battery fail).
4. Click **📄 Download PDF** — the PDF should open with all sections, photos, signatures, and the remedials table.
5. Click **Mark Reviewed**.

### Step 5 — Remedials list

1. Go to **Remedials**.
2. The "Batteries need replacing" urgent remedial is listed.
3. Change status to **Quoted**.

---

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run typecheck    # TypeScript check only
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright smoke tests (requires running server)
```

---

## Project Structure

```
src/
├── types/index.ts          # All canonical types (import from here)
├── lib/
│   ├── db.ts               # Dexie (IndexedDB) instance
│   ├── supabaseClient.ts   # Supabase singleton
│   ├── syncEngine.ts       # Queue processor
│   └── useOnline.ts        # navigator.onLine hook
├── templates/              # JSON template definitions
├── form-engine/            # FormEngine, fields, useFormState, remedialDetector
├── pdf/                    # @react-pdf/renderer document + upload
├── offline/                # SyncQueue, SyncStatusBanner, useSync
├── auth/                   # AuthProvider, AuthGuard, LoginPage
├── hooks/                  # useJobs, useJobsheet, useSites, etc.
├── components/             # UI primitives, layout (AppShell), feature components
├── pages/
│   ├── engineer/           # EngineerJobsPage, FillJobsheetPage, etc.
│   └── manager/            # ManagerJobsListPage, ReviewJobsheetPage, etc.
└── router/index.tsx        # All routes with AuthGuard wrappers

supabase/
├── migrations/             # 4 SQL migration files
└── seed/seed.sql           # Demo data
```

## Architecture Notes

See [DECISIONS.md](DECISIONS.md) for the rationale behind key choices.

See [ROADMAP.md](ROADMAP.md) for planned features.

See [CLAUDE.md](CLAUDE.md) for project conventions when working with Claude Code.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Engineer logs in on phone → sees today's assigned jobs | ✅ |
| 2 | Fill sheet in airplane mode → add photos + signature → submit → "queued" | ✅ |
| 3 | Network back on → sync completes without data loss | ✅ |
| 4 | PDF viewable by manager within 1 min of sync | ✅ |
| 5 | Fail answer → appears in manager's remedials list | ✅ |
| 6 | Company B cannot see company A data (RLS) | ✅ |
| 7 | App installs to phone home screen, opens offline | ✅ |
| 8 | `npm run build`, Vitest unit tests pass | ✅ |
