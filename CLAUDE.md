# CLAUDE.md — Project Conventions

This file guides Claude Code when working in this repository.

## What This Project Is

A mobile-first Progressive Web App for small UK fire and security installers to create, fill, and submit jobsheets and service reports. Engineers complete forms on-site (offline), sign, and submit. Managers review PDFs and manage remedials.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) — no `tailwind.config.ts` |
| PWA | `vite-plugin-pwa` (Workbox) |
| Offline DB | Dexie v4 (IndexedDB wrapper) |
| Backend | Supabase (auth, Postgres, Storage) |
| PDF | `@react-pdf/renderer` |
| Signatures | `signature_pad` |
| Testing | Vitest (unit) + Playwright (e2e) |

## Key Conventions

### Types

- **All shared types live in `src/types/index.ts`** — never duplicate types elsewhere.
- Property names are `snake_case` to mirror Postgres column names exactly.
- The `AnswersMap` type (`Record<string, FieldAnswer>`) is the JSONB answers blob stored on jobsheets.

### Data Access Pattern

Reads are **Supabase-first, Dexie-fallback**. Use the helpers instead of hand-writing it:
- Lists: `useCachedQuery<T>({ table, eq, order })` (hooks in `src/hooks/` wrap it), or `fetchCached()` outside React (`src/lib/cachedQuery.ts`).
- One row: `fetchOneCached<T>(table, id)`.
- supabase-js returns `{ error }` instead of throwing, so a hand-written read must check `error` or its fallback never runs.
- Fetched rows are cached through `mergeServerRows()`, so rows with unsent local changes keep the local copy, and locally created rows still show in lists.

**Never** filter rows by `company_id` in React — this is handled entirely by RLS. The Supabase query just calls `.select('*')` and RLS returns only the caller's data. Dexie only holds the signed-in company (it's wiped on sign-out).

### Write Pattern (Online + Offline)

Use `writeRecord(table, op, row)` / `writeRecords([...])` from `src/lib/writeRecord.ts` (`op`: `insert`, `update` with a patch `{ id, ...fields }`, or `delete`):
1. Dexie and the sync queue are written in one transaction.
2. If online, the queue is flushed straight away, so writes to the same row stay in order.
3. It returns `saved` / `queued` / `failed`, and toasts for queued or failed. Rejected items wait on the Sync screen (`/sync`, `/manager/sync`).
In a `writeRecords` batch each write waits for the ones before it (parent before lines). The engineer jobsheet submit builds its queue items by hand (`FillJobsheetPage`).

### Form Engine

- `<FormEngine template jobsheetId companyId readOnly? onSave? onSubmit? />` — top-level renderer.
- `useFormState(jobsheetId, template)` — manages `answers: AnswersMap`, debounced Dexie save every 2 s.
- Repeatable section answers live at `answers[sectionId + '_instances']` as `AnswersMap[]`.
- Remedial auto-detection: `detectRemedials(template, answers, jobsheetId, siteId, companyId)` — pure function, safe to call any time.
- Ids that can be created twice are deterministic (`src/lib/ids.ts`): `jobsheetIdFor(jobId)`, `remedialIdFor(...)` (used by `detectRemedials`, so a re-run gives the same rows).
- Validation lives in `src/form-engine/validation.ts`; repeatable-section errors are keyed by `instanceErrorKey(section, index, field)`.

### Jobs and dates

- Engineer status moves are defined once in `src/lib/jobStatus.ts` (mirrors `set_job_status`). Change status with `changeJobStatus(job, to)` from `src/offline/SyncQueue.ts`; completion only happens by submitting the jobsheet.
- Manager status rules are in `jobStatus.ts` too: `isPlannable()` (only unassigned/scheduled jobs can be moved or reassigned), `statusAfterAssign()` (assigning schedules, unassigning un-schedules), `managerActions()` (review / invoice / cancel). Creating an invoice for a job sets it to `invoiced` in the same `writeRecords` batch; the invoice job picker only offers `reviewed` jobs.
- Planner maths (durations, `findClashes`, `movePatch`) is in `src/lib/planner.ts`; `duration_minutes` null means 60.
- Every job creation, status change and reassignment is logged to `audit_log` by a trigger (00012); the job's History tab is `buildTimeline()` in `src/lib/jobTimeline.ts`.
- Calendar dates (`scheduled_date` etc.) come from `localISODate()` / `addDaysISO()` in `src/lib/dates.ts`. Never use `toISOString()` for a date: it's UTC, an hour behind in BST.
- When caching fetched rows, use `mergeServerRows()` so rows with unsynced local changes aren't overwritten (only `useJobs` so far).

### Photos and signatures

- Taking a photo or saving a signature writes the file to `db.blobs` straight away (bytes + MIME type, keyed by its storage path; read it back with `getLocalBlob()`). Answers hold only `{ id, storage_path }` / `{ storage_path, captured_at }`.
- Paths (`src/lib/media.ts`): `photos/{company}/{jobsheet}/{photo}.jpg` and `photos/{company}/{jobsheet}/signatures/{engineer|customer}.png`. `jobsheets.*_signature_url` hold these paths, not URLs.
- Nothing is uploaded before submit. Submit queues a `storage_upload` per file (after the jobsheet), a `photos` row insert per photo (after its upload), then `generate_pdf` (after everything).
- Show stored images with `<MediaImage path>` / `useMediaSrc()`: local file if it's on the device, else a signed URL.

### PDF

- `generateAndUploadPDF(jobsheetId)` in `src/pdf/generatePDF.ts` loads its own data (Supabase first, Dexie fallback), renders client-side, uploads to the private `pdfs` bucket, stores `jobsheets.pdf_path` (Supabase + Dexie) and returns the path. It throws `PDFError` with an HTTP-style `status`.
- Open a PDF with `openStorageFile('pdfs', path)` (signed URL on demand). Never store public or signed URLs.
- Engineers' PDFs come from the `generate_pdf` queue item (offline-safe, retried). Managers can regenerate from the job's Jobsheet tab.
- Timestamps in the PDF use `formatUKDateTime()` etc. (Europe/London).
- Never import `@react-pdf/renderer` at the top level of a page — it is large. Use dynamic import or keep it in `src/pdf/`.

### Sync Engine

- `startSyncEngine()` is called once, at module load in `src/App.tsx`.
- `flushQueue()` is idempotent; calling it while already syncing returns `{ synced: 0, failed: 0 }` (and reruns once the current flush ends).
- `enqueueSync()` schedules a debounced flush. The engine also flushes on `online`, on `visibilitychange`, every 30 s, and when `AuthProvider` sets the user via `setSyncIdentity()`.
- Items are stamped with `user_id` and sent in `seq` order, only under that user's session.
- Pick the operation by RLS: `insert` (ON CONFLICT DO NOTHING) for insert-only tables, `update` (a patch `{ id, ...fields }`) for edits, `upsert` only where the role has INSERT and UPDATE. Job status changes use `enqueueJobStatus()` (the `set_job_status` RPC).
- An item waits while an earlier item for the same row (`entity_key`) or any `depends_on` key is unsent.
- Network errors, 5xx, 401, 408 and 429 retry with backoff and stay `pending`. Other 4xx mark the item `failed`; the engineer retries or discards it on `/sync`.
- Sign-out wipes Dexie (`clearLocalData()`), after a warning if the queue isn't empty.

### Routing & Auth

- `<AuthProvider>` wraps the entire app in `App.tsx`.
- `<AuthGuard roles={['engineer']}>` / `<AuthGuard roles={['manager']}>` protects routes.
- Engineer routes: `/jobs`, `/jobs/:id`, `/jobs/:id/fill`, `/jobs/:id/submitted`, `/sync` (queue issues + sign-out).
- Manager routes: `/manager/*` subtree.

### File Naming

- Pages: `PascalCase` (e.g., `FillJobsheetPage.tsx`).
- Hooks: camelCase prefixed with `use` (e.g., `useJobs.ts`).
- UI components: PascalCase (e.g., `Button.tsx`).
- Templates: snake_case JSON (e.g., `fire_alarm_service.json`).

## Multi-Tenancy

Every Postgres table has `company_id`. RLS policies enforce isolation. Helper functions `get_my_company_id()`, `get_my_role()`, `get_my_profile_id()` are SECURITY DEFINER and safe to call from RLS policies.

Storage path convention: `{bucket}/{company_id}/{entity_id}/{filename}`.

## Common Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build (must have zero TS errors)
npm run typecheck    # tsc --noEmit only
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright smoke test
```

## Environment Variables

Copy `.env.example` to `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Local Supabase (optional)

```bash
supabase start       # Starts local Postgres + Auth + Storage
supabase db reset    # Applies all migrations + seed
supabase stop
```

## Do Not

- Do not add `company_id` filters to Supabase queries — RLS handles it.
- Do not store blobs as base64 — use `db.blobs` (binary) in Dexie, `storage_path` in DB.
- Do not call `startSyncEngine()` more than once — it is guarded by `if (started) return`.
- Do not import `@react-pdf/renderer` outside `src/pdf/`.
- Do not add `tailwind.config.ts` — Tailwind v4 uses CSS-based config only.
