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
- Pre-fill: a template field with `"prefill": <PrefillKey>` (`src/templates/types.ts`) is filled from the job by `prefillAnswers()` (`src/lib/jobsheetPrefill.ts`) when `FillJobsheetPage` creates the jobsheet: site, date, call/client no., visit type, reported fault, engineer, system, arrival/travel times. `departure_time` / `time_taken` are filled at submit by `fillSubmitAnswers()` (FormEngine `prepareSubmit`, before validation). Neither overwrites what the engineer typed.
- Managers set `jobs.call_no`, `jobs.client_no` (defaults to `sites.client_no`; the first one given becomes the site's) and an optional `jobs.reported_fault` on New Job (00015). The site's Jobsheets tab lists its sheets with a sub-tab per template (`?sheet=`). Template labels: `TEMPLATE_OPTIONS` in `src/templates/labels.ts`.

### Jobs and dates

- Engineer status moves are defined once in `src/lib/jobStatus.ts` (mirrors `set_job_status`). Change status with `changeJobStatus(job, to)` from `src/offline/SyncQueue.ts`; completion only happens by submitting the jobsheet.
- Manager status rules are in `jobStatus.ts` too: `isPlannable()` (only unassigned/scheduled jobs can be moved or reassigned), `statusAfterAssign()` (assigning schedules, unassigning un-schedules), `managerActions()` (review / invoice / cancel). Creating an invoice for a job sets it to `invoiced` in the same `writeRecords` batch; the invoice job picker only offers `reviewed` jobs.
- Planner maths (durations, `findClashes`, `movePatch`) is in `src/lib/planner.ts`; `duration_minutes` null means 60.
- Every job creation, status change and reassignment is logged to `audit_log` by a trigger (00012); the job's History tab is `buildTimeline()` in `src/lib/jobTimeline.ts`.

### PPM contracts

- Rules live in `src/lib/contracts.ts`: labels, `PPM_TEMPLATE`, `advanceDue()` (must match `next_due_date()` in 00014), `contractDueState()` / `dueLabel()` (overdue / due today / due soon ≤30 days). Compare calendar dates with `daysBetween()`, never `Date` maths.
- A visit's job is made by the `generate_visit_job(contract, date, engineer?, template?)` RPC. It's idempotent per visit, manager-only and online-only.
- When that job reaches awaiting_review/completed/reviewed/invoiced, a trigger completes the visit and moves `next_visit_due` on (from the visit date, keeping `start_date`'s day of month; never backwards; null after `end_date`). Cancelling the job frees the visit.
- One visit per contract per date (unique).
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

- `<AuthProvider>` wraps the entire app in `App.tsx`. It always re-reads the user's own profile when online (`resolveProfile()` in `src/auth/resolveProfile.ts`): it claims a pending invite if there's no profile, and wipes local data if the profile was removed (`active = false`). Its `access` is `ok` / `none` (onboarding) / `removed` / `offline`.
- Login (`LoginPage`) is email + password (`signInWithPassword`, then `/auth/callback` routes by role); "Email me a sign-in link instead" uses `signInWithOtp` with `shouldCreateUser: false`. Anyone signed in can set or change their password with `<SetPasswordForm>` (`/sync`, `/manager/sync`, manager Settings; online only).
- `AuthGuard` renders `OnboardingPage` instead of the route unless `access === 'ok'`: "Create your company" (`create_company_and_manager` RPC), "access removed", or "offline".
- Team (`/manager/team`): invites go through the `invite-user` Edge Function (`supabase/functions/invite-user`). If it isn't deployed, the invite row is saved and the login is sent from the dashboard. `remove_member` / `restore_member` / `set_member_role` RPCs (00013); removing hands the member's unfinished jobs back to Unassigned. Team changes are online-only (not queued).
- `useProfiles()` hides removed members unless `includeInactive` is set.
- `<AuthGuard roles={['engineer']}>` / `<AuthGuard roles={['manager']}>` protects routes.
- Engineer routes: `/jobs`, `/jobs/:id`, `/jobs/:id/fill`, `/jobs/:id/submitted`, `/sync` (queue issues + sign-out).
- Manager routes: `/manager/*` subtree (including `/manager/team` and `/manager/sync`).

### File Naming

- Pages: `PascalCase` (e.g., `FillJobsheetPage.tsx`).
- Hooks: camelCase prefixed with `use` (e.g., `useJobs.ts`).
- UI components: PascalCase (e.g., `Button.tsx`).
- Templates: snake_case JSON (e.g., `fire_alarm_service.json`).

### Sites

- A site has a `name` (its title everywhere, e.g. "250 St Vincent St (250 SVS)"), an `address` (`''` when unknown) and `job_codes text[]` (Emtec codes, e.g. `FS1178`, `FS1178/4`; several per site) — 00016. Show `site.name`, not `site.address`, as a site's label. Inserts without a name take the address (trigger).
- `supabase/scripts/emtec_staff_invites.sql` adds Emtec's staff as pending invites (claimed on first sign-in; non-destructive, re-runnable).
- `supabase/scripts/emtec_reset_and_import.sql` is a one-off: wipes one company's business data and loads Emtec's 49 sites (tested in `tests/db/emtecImport.test.ts`).

### Devices

- Rules in `src/lib/devices.ts`: labels, `parseDevicePayload()` (scanner), `deviceQrUrl()`, `coverage()` (active devices with a pass/fail in the last 12 months; removed and "not tested" don't count), `collectDeviceTests()`.
- `devices.status` is `active` / `removed` (00017); removed devices keep their history but leave service sheets and coverage. Link a device to a system with `system_id` (picker on the device form).
- One device page for both roles: `/devices/:id` (Record test). Managers also get `/devices/:id/edit` and `/devices/:id/qr`. Add a device from the site's Devices tab (`/manager/sites/:siteId/devices/add`). Old `/manager/sites/:siteId/devices/...` URLs redirect.
- A QR label holds `<origin>/d/<qr_code>`, so a phone camera opens the device; `/d/:code` looks it up. The scanner also accepts the bare code on older labels.
- Service sheets: a `device_tests` template field lists the site's active devices (on the job's system, or on none). Answers are `{ [deviceId]: { result, note, label } }`; a fail needs a note and raises a remedial. Submit queues one `device_tests` insert per device with a result (`deviceTestIdFor(jobsheet, device)`, after the jobsheet). RLS: the device must be the caller's company's, and the jobsheet one they can see.
- Engineers' phones keep the day's sites' devices (`EngineerJobsPage`, `EngineerJobDetailPage`) for offline scanning and tests. The engineer job page shows site hazards, keyholders and ARC / police URN.
- Edit forms: site (`/manager/sites/:id/edit`, incl. hazards and keyholders in calling order), system (`/manager/sites/:id/systems/new`, `/manager/systems/:id/edit`), customer (`/manager/customers/:id/edit`). The site's customer can't be changed (contracts copy it).

### Switched-off features

- `FEATURES` in `src/lib/features.ts` turns parts of the app off without deleting them. Quotes and invoices are off: no menu items, routes, dashboard tiles, report tab, search results, "Create invoice" button or `invoiced`/`quoted` filter options, and `useQuotes`/`useInvoices` fetch nothing. Their pages, hooks and tables are kept; gate any new entry point on the flag.

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
