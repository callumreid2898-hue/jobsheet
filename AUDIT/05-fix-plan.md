# 05 — Fix plan

Fixes are grouped into small batches in priority order: security and data-loss first, then the core engineer loop, then the missing cross-feature links. Each batch should leave `npm run build`, `npm run test` and the e2e smoke tests green. **Nothing here has been started. It needs your approval.**

**Size:** S = under half a day · M = 1–2 days · L = 3 days or more

---

## Batch 0 — Pre-flight (S)

Confirm against the hosted project before any SQL is written. This needs your go-ahead to run the probe, or an equivalent check in the SQL editor.

- Does `jobs.scheduled_time` exist on the hosted DB (C4)? Which `template_id` CHECKs are live (C5)?
- Was `seed.sql` applied to the hosted DB? If so, the `Password1!` accounts and fixed UUIDs are live (M20). Rotate or delete them.
- Is public signup enabled in the hosted Auth settings (C3)?
- What are the actual results for engineer upserts (C7, H23) and `log_audit_event` as anon (M1)?

**Batch 0 result (2026-10-19):**
- Probe run as anon (see `04-findings.md`).
- The hosted DB has only 00001–00004 (new C18).
- `scheduled_time` is absent.
- Public signup is on.
- The seed was applied to hosted, but its password logins are broken.
- Authenticated RLS checks are still pending.
- **Outstanding hosted actions (owner):**
  - apply 00005 → 00009 in order;
  - decide whether to delete or rotate the seed `@acme.test` / `@other.test` accounts and the fixed-UUID demo company;
  - disable public signup until Batch 1 lands.

**Batch 2 result (2026-10-19), done locally and not yet applied to hosted:**
- `supabase/migrations/00009_schema_drift.sql`: `scheduled_time` as `HH:mm` text with a format CHECK; `duration_minutes`; both template CHECKs widened to all 7 ids.
- `SampleReportViewer.tsx` now uses static imports.
- Seed: job types updated to the 00008 values; `auth.users.email_change` set to `''`.
- New `tests/unit/templateIds.test.ts` (fails without 00009).
- `tsconfig.test.json` added to the project references, so `typecheck` and `build` now cover `tests/`; the existing detector test type errors were fixed.
- Playwright runs against `vite preview` on port 4173; login selector fixed.
- Results: typecheck clean · build OK · unit 21/21 · e2e 6/6.

**Batch 1 result (2026-10-19), done locally and not yet applied to hosted:**
- `supabase/migrations/00010_security.sql`: everything listed below.
- Engineer job updates now go only through `set_job_status` (`jobs_update` is manager-only), instead of a column-guard trigger.
- The `pdfs` update policy lets the assigned engineer overwrite their own report, because uploads use upsert. Delete is manager-only.
- Invites: new `invites` table (managers insert), `handle_new_user` → `claim_invite_for`, and a `claim_invite()` RPC for users whose auth account already exists.
- Signup disabled in `config.toml`; `shouldCreateUser: false` on login.
- Tests: `tests/db/harness.ts` (PGlite + Supabase auth/storage stubs) and `tests/db/rls.test.ts` (36 tests; 25 fail without 00010).
- **Client follow-ups this creates:**
  - Engineer status changes must call `set_job_status`. Their upserts were already rejected (C7), so nothing regresses; this is fixed in batches 3–4.
  - Inviting someone currently means inserting an `invites` row and sending a dashboard invite. The UI comes in batch 8.

## Batch 1 — Security lockdown (M) · C1 C2 C3 M1 H1 H2 H3 M21 L1 L2

**Files:** new `supabase/migrations/00009_security.sql`, `src/auth/LoginPage.tsx`, `supabase/config.toml`.

- **profiles:**
  - Drop `profiles_insert_own`.
  - Add a BEFORE UPDATE trigger that rejects changes to `role`, `company_id` or `user_id` unless the caller is service_role.
  - `grant update (full_name)` only.
- **Auth:**
  - Rewrite `handle_new_user` to read from a new `invites(email, company_id, role, token, expires_at, accepted_at)` table, never from user metadata.
  - `enable_signup = false` for production.
  - `shouldCreateUser: false` on login.
- **audit_log:** revoke EXECUTE on `log_audit_event` from public/anon/authenticated. Fix the `log_jobsheet_submitted` attribution (use `auth.uid()`).
- **jobsheets:**
  - UPDATE only by a manager, or by the assigned engineer while `submitted_at is null`.
  - INSERT checks that the job belongs to the caller's company.
  - SELECT for engineers limited to their assigned jobs.
- **jobs:** a `set_job_status(job_id, status)` SECURITY DEFINER RPC with an engineer transition whitelist (scheduled → travelling → on_site → completed → awaiting_review), plus a trigger that blocks other column changes by engineers.
- **Financial tables:** manager-only SELECT on `price_list_items`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `job_lines`.
- **Storage:** split the `pdfs` policy so only managers can update or delete.
- **Functions:** `set search_path = public, pg_temp` on every SECURITY DEFINER function. Reduce the anon grants.

**Tests to add:** `tests/rls/*.sql` (pgTAP) or a Node RLS script run against local Supabase, covering:
- an engineer can't change their own role or company;
- signing up with metadata doesn't create a profile;
- anon can't call `log_audit_event`;
- engineer B can't update engineer A's jobsheet;
- an engineer can't set `invoiced`;
- company B sees 0 rows from company A on every table.

## Batch 2 — Schema drift and build (S) · C4 C5 C14 M20 L7

**Files:** `00009` (or a separate `00010_schema_drift.sql`), `src/pdf/SampleReportViewer.tsx`, `supabase/seed/seed.sql`, `tests/e2e/smoke.spec.ts`.

- `alter table jobs add column scheduled_time time, add column duration_minutes int` (skip if Batch 0 shows the column already exists).
- Recreate both `template_id` CHECKs with all 7 ids, or replace them with a `templates` lookup table.
- `SampleReportViewer`: switch to static imports, or delete the file.
- Seed: use `ppm_service` / `reactive_callout`.
- e2e: fix the selectors; run against `vite preview` so the manifest is present.

**Tests to add:** a unit test that the `templates/*.json` ids equal the `TemplateId` union and the migration CHECK list. Include `tests/` in `tsc`.

## Batch 3 — Sync engine correctness (M) · C6 C7 H8 H9 H23 M7 C15 H6

**Batch 3 result (2026-10-20), done locally:** everything below except `jobs.updated_at` stale-write rejection (H8 second half, needs a migration — deferred). Notes:
- Client `audit_log` insert on submit removed; the `jobsheet_submitted_log` trigger (00010) already logs it.
- Dexie v5 migrates old queue items with `user_id = null`; they're not sent automatically and show on `/sync` for retry (which claims them) or discard.
- Transient errors retry indefinitely with backoff (5 s doubling, 15 min cap); only 4xx marks an item `failed`.
- Manager writes other than jobs (invoices, quotes, import) still use `upsert` — Batch 6. Manager `/sync` screen not added; managers' banner/queue UI is Batch 6/7.
- Tests: `tests/unit/syncEngine.test.ts` (fake-indexeddb, 22 tests), `tests/db/rls.test.ts` "sync retries" (2 tests).

**Files:** `src/offline/SyncQueue.ts`, `src/lib/syncEngine.ts`, `src/types/index.ts` (SyncQueueItem), `src/offline/SyncStatusBanner.tsx`, new `src/pages/engineer/SyncIssuesPage.tsx`, `src/auth/AuthProvider.tsx`, `vite.config.ts`, `src/components/layout/BottomNav.tsx`.

- `enqueueSync` stamps `user_id`, `company_id` and a monotonic `seq`, and triggers a debounced `flushQueue()` when online. Also flush on an interval and on `visibilitychange`.
- New operations:
  - `insert` (upsert with `ignoreDuplicates`) for insert-only tables;
  - `update` (a patch `.eq('id')`);
  - `rpc` (for `set_job_status`).
  Keep `upsert` only where the role has both INSERT and UPDATE.
- Flush only when a session exists, and only items whose `user_id` matches the current user. Skip children while their parent item is pending.
- Classify errors: network errors, 5xx and 401 are transient and use `next_attempt_at` backoff; other 4xx are permanent and are marked so `last_error` can be shown.
- Sync issues screen: list items, retry or discard each one.
- Sign-out: if the queue is non-empty, warn. Then `db.delete()` and `caches.delete('supabase-cache')`. Add sign-out to the engineer shell.
- Remove the Workbox runtime caching for `/rest/v1` and `/auth/v1`.

**Tests to add** (extend `syncEngine.test.ts`):
- success deletes the item;
- failure increments attempts and sets `last_error`;
- transient vs permanent errors;
- ordering by `seq` and parent gating;
- items from another user are skipped;
- `enqueueSync` triggers a flush when online.

## Batch 4 — Engineer job flow (M) · C10 H10 H11 M5 M6 M8 H17 (engineer pages)

**Batch 4 result (2026-10-20), done locally:** all items below. Also fixed, found by the new e2e test:
- `useJobs` re-fetch overwrote optimistic local job changes with the stale server row before the queue flushed (Today buttons snapped back). New `mergeServerRows()` keeps rows with unsent queue items; other hooks still `bulkPut` blindly (Batch 6).
- The engineer bottom nav covered the jobsheet's fixed Submit bar, so Submit couldn't be tapped. The nav is hidden on `/jobs/:id/fill`.
Not done: "Assigning sets `scheduled`" (C10, planner — Batch 7); `unassigned` jobs show a "not scheduled yet" note instead of buttons. H17 for dashboard/CreateJob/invoices/reports is Batch 7 (helper is ready in `src/lib/dates.ts`).
A "fail" now always needs a note, even on optional fields.
Tests: `tests/unit/jobFlow.test.ts` (transitions vs the RPC, BST/GMT dates, stable ids, validation), `tests/e2e/engineer-flow.spec.ts` (Today → travelling → arrive → fill → double-tap submit → no resubmit, with a fake Supabase).

**Files:** new `src/lib/jobStatus.ts` (transitions + labels), new `src/lib/dates.ts` (`localISODate`, `formatUKDateTime`), `TodayPage.tsx`, `EngineerJobDetailPage.tsx`, `EngineerJobsPage.tsx`, `FillJobsheetPage.tsx`, `FormEngine.tsx`, `useFormState.ts`, `remedialDetector.ts`.

- Next-step buttons for every non-final status. "Complete" goes through submit. All status changes go through the `set_job_status` RPC (queued as `rpc` when offline). Remove the "disabled offline" behaviour.
- Submit:
  - disable while in flight;
  - redirect or render read-only once `submitted_at` is set;
  - set `completed_at`;
  - use `job.site_id` directly;
  - wrap the Dexie writes in one transaction.
- Deterministic ids:
  - jobsheet id = uuid v5 of `job_id`, or upsert `onConflict: 'job_id'`;
  - remedial id = uuid v5 of `jobsheet|section|instance|field|line`.
- `useFormState`: flush on unmount, `pagehide` and `visibilitychange`; surface save errors.
- Validate repeatable sections; type-aware emptiness check.
- Call `navigator.storage.persist()`.

**Tests to add:**
- transition-map unit tests;
- `localISODate` across the BST/GMT changeover (2026-10-25) and at midnight;
- `detectRemedials` produces stable ids on a re-run;
- e2e: engineer path from start to submit with mocked Supabase.

## Batch 5 — Photos, signatures, PDF (L) · C8 C9 C11 H12 H13

**Batch 5 result (2026-10-20), done locally, not applied to hosted:** everything below except the email Edge Function (it needs your choice of email provider). Differences from the plan:
- Uploads are queued **at submit**, not when the photo is taken. Photos are saved to the device (`db.blobs`) as soon as they're taken. Waiting means a photo taken and then removed is never uploaded, and storage RLS can check the jobsheet already exists on the server.
- Local files are stored as `ArrayBuffer` + MIME type, not `Blob`. Chromium private contexts (and some older iOS Safari versions) reject Blobs in IndexedDB. The e2e test found this.
- `jobsheets.pdf_url` was **renamed** to `pdf_path` (00011), and old public URLs were converted to paths.
- 00011 also scopes `photos` rows and the `photos` bucket like `pdfs` (manager or assigned engineer; deletes manager-only). 00003 had left them open to the whole company.
- `generate_pdf` waits on the jobsheet, uploads, photo rows, remedials and the status change. Render failures (422) and missing data (404) mark it failed; network errors retry.
- Manager "View PDF" (signed URL) and "Regenerate PDF" are on JobDetailPage's Jobsheet tab, which now loads Supabase-first. ReviewJobsheetPage (unrouted) only got the compile fix.
- PDF: engineer = `job.assigned_engineer_id` (may be none); "On site" uses `job.on_site_at`; times are Europe/London; checklists print `[x]` (Helvetica has no ☑ glyph); a stored signature whose image can't be loaded says so instead of "Not signed".
- Removed the dead `PhotoGrid.tsx` and `usePhotos.ts`.
- Not handled: drafts from older builds whose signatures are data URLs still display, but they aren't uploaded on submit. There are no production users, so I didn't add a migration path.
- Tests: `tests/unit/media.test.ts`, `pdf.test.ts` (real render in Node: repeat pass/fail rows, signature, missing photo), `reportData.test.ts` (assigned engineer, Dexie fallback, image embedding, error statuses), 4 new queue tests in `syncEngine.test.ts`, 4 photo RLS tests in `tests/db/rls.test.ts` (all fail without 00011), and the e2e flow now adds a photo and checks the signature, photo and PDF uploads and the stored paths.

**Files:** `PhotoField.tsx`, `SignatureField.tsx`, `FillJobsheetPage.tsx`, `syncEngine.ts`, `src/pdf/generatePDF.ts`, `PDFSections.tsx`, `JobsheetPDF.tsx`, a new migration (`jobsheets.pdf_path`), `JobDetailPage.tsx`.

- Photos: on pick, compress and save `db.photos.put({blob,…})`; queue a `photos` row insert and `storage_upload` to `{co}/{js}/{id}.jpg`; answers hold `{id}` only.
- Signatures: convert to a Blob, upload to `{co}/{js}/signatures/{engineer|customer}.png`, and set the `*_signature_url` columns to the path.
- PDF:
  - store `pdf_path`; generate a signed URL on demand;
  - use the engineer from `job.assigned_engineer_id`;
  - one shared field-value renderer for both normal and repeatable rows;
  - format times with `Europe/London`;
  - photos and signatures loaded as signed URLs or data URIs.
- Add a `generate_pdf` queue operation with retries, a Supabase fallback for missing data, and a manager "Regenerate PDF" button.
- Email: an Edge Function `send-report` that emails a short-lived signed link. **This is a new external integration and needs your choice of email provider.**

**Tests to add:** a PDFSections render test (repeatable `pass_fail_note`, signature present); photo queue → upload unit test with mocked storage.

## Batch 6 — Manager write pattern and offline reads (M) · C17 H7 M16 L4

**Batch 6 result (2026-10-20), done locally:** all items below. Notes:
- `writeRecord` doesn't write to Supabase directly. It writes Dexie and the queue in one transaction, then flushes at once (`flushNow()` also waits for a flush already running). That keeps the order behind earlier unsent writes to the same row, and the retry/error rules from Batch 3 apply.
- Reads go through `fetchCached` / `fetchOneCached` / `useCachedQuery` (`src/lib/cachedQuery.ts`, `src/hooks/useCachedQuery.ts`). All 12 list hooks and every manager detail page use them. That also covers the "Dexie-vs-Supabase read pattern" row in the consolidation table.
- `mergeServerRows` now works for any table. Given the query's filter, it adds unsynced local rows and drops locally edited rows that no longer match. So a site created offline shows in the Sites list straight away (C17's "online lists hide it").
- Managers get the Sync screen at `/manager/sync`; the banner links to it. Discarding a rejected *insert* also removes its local-only row.
- Global toasts (`src/lib/toast.ts`, `<GlobalToasts />` in both shells).
- Import now queues `insert`, not `upsert` (fresh ids). The rest of the import fixes are Batch 12.
- Small extras: CreateJob's default date and "mark paid" use `localISODate()` (H17 for those two). JobDetailPage reassign no longer writes twice. The scanner looks up `qr_code` server-first, with the cache as fallback.
- Removed the unused `useJobsheet.ts` and `useJobLines.ts`.
- Not done: Settings doesn't refresh the company name held in `AuthProvider` until reload. ReviewJobsheetPage (unrouted, deleted in Batch 7) still writes directly. Planner optimistic state is Batch 7.
- Tests: `tests/unit/writeRecord.test.ts` (13): saved / rejected / network / offline, parent-child gating, same-row ordering, fetchCached fallback on a returned error, unsynced local rows in lists, filter drop, fetchOneCached, discard cleanup, and `useSites` falling back with a failing fetch.

**Files:** new `src/lib/writeRecord.ts`, every hook in `src/hooks/*`, CreateSite / AddDevice / DeviceDetail / CreateContract / ContractDetail / CreateQuote / QuoteDetail / RemedialsList / CreateInvoice / InvoiceDetail / Settings pages.

- `writeRecord(table, row | patch)`: write to Dexie, then to Supabase; on `error`, enqueue and show a toast.
- Hooks: `if (error) throw error` so the Dexie fallback actually runs. Remove the `.eq('company_id')` calls.
- Detail pages: Supabase first, Dexie when it errors.

**Tests to add:** `writeRecord` unit tests (online OK, online error → queued, offline → queued); a hook fallback test with a failing fetch.

## Batch 7 — Job lifecycle and routing (M) · C13 C16 H14 H15 H16 M14 M15 H17 (dashboard)

**Batch 7 result (2026-10-20), done locally, not applied to hosted:** all items below. Notes:
- New migration `00012_job_activity.sql`. A trigger logs `job_created`, `job_status:<status>` and `job_assigned` to `audit_log` with the acting user. Writes with no user (service role) aren't logged. Before this, nothing logged status changes, so a timeline "built from audit_log" would have been empty.
- History tab: `buildTimeline()` merges audit rows (with names) with the job's own timestamps (created, travelling, on site, submitted). So older jobs, and offline views, still show something.
- JobDetailPage: Mark reviewed, Create invoice (`/manager/invoices/create?job=`, prefilled) and Cancel job (with a confirm). A rejected change rolls back. Reassigning also updates the status, and is disabled once the job has started. Manager status changes are a plain `update` of `status`, which `jobs_update_manager` allows; `set_job_status` is still for engineers.
- "Locked" means anything past `scheduled` (travelling/on site as well as closed), for both the planner and reassigning.
- Planner:
  - optimistic drop with rollback on rejection;
  - clash check with a confirm on drop, clashing cards outlined red;
  - cards show start–end times;
  - cancelled jobs hidden;
  - a "Needs attention" strip holds overdue unassigned jobs and jobs assigned to non-engineers (M15's "other" lane).
- CreateJobPage: duration field (default 60) and an inline overlap warning, plus a confirm.
- Invoices: the picker only shows reviewed jobs, and the job goes to `invoiced` after the invoice in the same queued batch. Issued/due dates use `localISODate`/`addDaysISO`.
- Dashboard: stats are now a pure `computeDashboardStats()`. Cancelled jobs are excluded; unassigned and donut counts use active jobs only; days and the 90-day cutoff come from the local date.
- The jobs list follows `?status=` and the remedials list follows `?status=` / `?priority=` (a new priority filter; `?status=all` for every status).
- The sidebar Remedials badge = open urgent remedials (`useNotificationCount`, fetched for managers only).
- Routing: Sites cards link to `/manager/sites/:id`; the three legacy redirects use `relative="path"`. Deleted ReviewJobsheetPage, AssignEngineerPage and SiteHistoryPage.
- e2e fake Supabase moved to `tests/e2e/fakeSupabase.ts`.
- Tests:
  - `tests/unit/planner.test.ts` (14): clash maths incl. back-to-back, movePatch status and locking, manager actions, dashboard stats incl. cancelled and the clock change, timeline;
  - `tests/db/rls.test.ts` job activity log (3; the main one fails without 00012);
  - `tests/e2e/manager-review.spec.ts` (3): review → invoice → job invoiced, Sites link and legacy redirects, planner drag schedules the job and it stays put.

**Files:** `JobDetailPage.tsx`, `router/index.tsx`, `SitesPage.tsx`, `PlannerPage.tsx`, `CreateJobPage.tsx`, `CreateInvoicePage.tsx`, `useDashboardStats.ts`, `DashboardPage.tsx`, `ManagerJobsListPage.tsx`, `RemedialsListPage.tsx`, `AppShell.tsx`.

- JobDetailPage: PDF link, Mark reviewed, Cancel, and an activity timeline built from `audit_log`.
- Fix the Sites card link and the three `Navigate to="../"` redirects.
- Planner:
  - optimistic state with rollback;
  - assign/unassign updates status;
  - overlap warning using `duration_minutes`;
  - overdue unassigned pool;
  - final-status jobs locked.
- Invoice creation sets the job to `invoiced`; the job picker shows only `reviewed` jobs.
- Dashboard: filter counts by status, use the local date, honour `?status=` / `?priority=`, and wire up `notificationCount`.

**Tests to add:** clash-detection unit test; dashboard stats unit test; e2e: manager reviews a submitted job.

## Batch 8 — Onboarding and team (L) · H4 H5 M3 M4

**Batch 8 result (2026-10-20), done locally, not applied to hosted.** All items below. Notes:
- **Migration `00013_team.sql`:**
  - `profiles.active`;
  - `get_my_company_id/role/profile_id()` ignore inactive profiles, so every RLS policy shuts a removed member out;
  - a new `profiles_select_self` policy, so a removed user can still see they were removed;
  - `create_company_and_manager(name, full_name)`. It refuses if the user already has a profile, or has a pending invite (they should join that company instead).
  - `remove_member(id)`: deactivates, and unassigns their scheduled/travelling/on_site/completed jobs. Returns the count.
  - `restore_member(id)`.
  - `set_member_role(id, role)`: a company always keeps one active manager.
  - All manager-only, own company, not yourself (`managed_member` helper; no grant).
- **No `accept_invite` RPC:** 00010's `claim_invite()` already does it. `AuthProvider` calls it whenever a signed-in user has no profile.
- **Edge Function `supabase/functions/invite-user`:**
  - Writes the invite with the caller's JWT, so RLS decides whether they may invite.
  - Then calls `auth.admin.inviteUserByEmail` with the service role. That uses Supabase's built-in invite email, so no email provider is needed (it has a low rate limit; the Batch 5 report email is still separate).
  - If the person already has a login, they just sign in and the invite is claimed.
  - **Not deployed or tested against a real project** (no Supabase CLI here). The Team page falls back to saving the invite and telling the manager to send the login from the dashboard.
- **AuthProvider:** server-first profile and company on every start, on `online`, and on user change. Removed → wipe Dexie. Offline with nothing cached → an "offline" screen instead of an empty app. Start-up loads are de-duplicated.
- **M4 (hand-off):**
  - The removed engineer's unfinished jobs go back to the planner's Unassigned / "Needs attention".
  - A jobsheet already on the server stays with the job, so the next engineer gets it.
  - Unsynced work on the removed device is lost. The confirm on the Team page says so, and suggests the engineer syncs first.
- **Tests:**
  - `tests/db/rls.test.ts` "team (00013)", 6 tests: create company once, invite beats create, removal lock-out and job hand-off, restore, permission checks, last manager;
  - `tests/unit/auth.test.ts`, 7 tests: every `resolveProfile` outcome;
  - `tests/e2e/team.spec.ts`, 3 tests: onboarding → dashboard, removed screen with Dexie wiped, Team page invite fallback and remove.
  - These run against PGlite and the fake Supabase, not local Supabase (none available).

**Files:** a new migration (`create_company_and_manager`, `accept_invite`, `remove_member`, `set_member_role` RPCs), a new Edge Function `invite-user`, new `OnboardingPage` and `TeamPage`, `AuthProvider.tsx`, `AuthGuard.tsx`, `AuthCallbackPage.tsx`.

- First login with no profile and no invite shows "Create your company". With an invite, accept it.
- Profile revalidated on every online start; wipe local data if the profile was removed.
- Soft-deactivate members (an `active` flag checked in `get_my_company_id`).

**Tests to add:** RLS/RPC tests for each RPC; e2e onboarding with local Supabase.

## Batch 9 — PPM engine (L) · C12 M12 M13

**Batch 9 result (2026-10-20), done locally, not applied to hosted:** all items below except the optional pg_cron (it needs the email provider). Notes:
- **Migration `00014_ppm.sql`:**
  - `contracts.start_date`/`end_date` (end ≥ start);
  - duplicate visits cleaned up, then `unique(contract_id, scheduled_date)` and one visit per job;
  - `next_due_date(from, frequency, anchor)`;
  - `generate_visit_job(contract_id, date?, engineer?, template?)`. It creates or reuses the visit, creates a `ppm_service` job (template from the system type, unassigned or scheduled), and links them. Manager-only, active contracts only, idempotent per visit.
  - `jobs_sync_contract_visit` trigger.
- **Trigger rules:**
  - A finished job counts from **awaiting_review** onwards, since submission is how jobs finish.
  - The next date comes from the visit's date, not the completion date, so late jobs don't shift the schedule.
  - It keeps the start date's day of month (31 Jan → 28 Feb → 31 Mar), never moves the date backwards, and becomes null past the end date.
  - A cancelled job sets the visit back to pending with no job.
- **Shared `src/lib/contracts.ts`:** labels (it also replaces the copies in Site/Customer/System detail pages), templates, date maths, `contractDueState` with `due_today` (M12: the due day is no longer "Overdue").
- **Dashboard PPM card:** overdue first, then due within 90 days, with labels. It shows "+n more", and clicking opens the contract.
- **Reports:** "Due before" excludes contracts with no date; shows labels and due state.
- **Contract form (create and edit):**
  - `/manager/contracts/:id/edit`;
  - a system picker, which sets the system type;
  - the customer must come from the site, so the insert no longer silently fails with `customer_id: ''` (M13);
  - start/end dates; the next visit defaults to the start date.
- **ContractDetailPage:**
  - a due-state label and an Edit link;
  - "Create job for this visit" with an optional engineer, which opens the new job;
  - visits link to their job, and pending visits get "Create job";
  - adding a visit on an existing date is refused.
- **Also fixed:** the planner dropped onto the slot with the most overlap with the dragged card, often one below the pointer. It now uses `pointerWithin`. The planner e2e test also waits for the drop highlight before releasing; it was flaky.
- **Tests:**
  - `tests/unit/contracts.test.ts` (12): month ends, leap years, every frequency, anchor day, BST/GMT day counts, due states and labels;
  - `tests/db/rls.test.ts` "PPM engine" (7): SQL vs TS date maths case by case, generate permissions and idempotency, unique visits, completion advances, a late job doesn't go back, cancel frees the visit, end date, paused contracts;
  - `tests/e2e/contracts.spec.ts` (1).

**Files:** new `src/lib/contracts.ts` (`advanceDue`, `contractDueState`, labels), a migration (`generate_visit_job` RPC, trigger on `jobs` status, `unique(contract_id, scheduled_date)`, `start_date`/`end_date`), `ContractDetailPage.tsx`, `CreateContractPage.tsx` (system picker, edit form), `useDashboardStats.ts`, `ReportsPage.tsx`.

- "Generate job" for due visits; a job reaching completed/reviewed marks the visit complete and advances `next_visit_due`; a cancelled job resets the visit.
- Optional: nightly pg_cron for expiry and reminder emails (needs Batch 5's email provider).

**Tests to add:** `advanceDue` (31 Jan → Feb, leap years, every frequency); `contractDueState` around BST; SQL test for the trigger.

## Batch 10 — Remedials → quotes → jobs (L) · H21 H22 M9 M10 M11

**Files:** a migration (`quotes.accept_token`, `token_expires_at`, `accepted_at`, `accepted_by_name`; `jobs.quote_id` unique; `remedials.job_id`; `unique(company_id, reference)` + reference sequence RPC; `get_quote_by_token` and `respond_to_quote` RPCs granted to anon), new `src/lib/money.ts`, a public route `/q/:token` outside AuthGuard, `CreateQuotePage.tsx`, `QuoteDetailPage.tsx`, `RemedialRow.tsx`, `CreateInvoicePage.tsx`, Settings price list CRUD, `remedialDetector.ts`.

- "Quote this remedial" sets the remedial to `quoted`; rejecting a quote sets it back to `open`; accepting offers "Create remedial works job"; completing that job marks the remedials `done`.
- Lock quotes that aren't drafts. Quote → invoice prefills and locks the customer and site, and guards against duplicates.
- Remedial descriptions include the instance label; flag the new templates' defect fields.

**Tests to add:**
- `money.ts` totals (rounding, 0/5/20% VAT);
- token RPC tests: expired token, wrong status, response doesn't leak other quotes;
- template validation test;
- e2e: public accept page.

## Batch 11 — Devices, QR, coverage, site safety info (L) · H18 H19 H20 H24 M17 M18

**Files:** a new shared route `/devices/:id`, a `device_test` form field type, `FormSection.tsx`, `remedialDetector.ts` (failed test → remedial), migration (coverage view, `devices.status`), `ScannerPage.tsx`, `DeviceQRPage.tsx` (URL payload, print CSS), `SiteDetailPage.tsx` (Devices tab, edit forms, keyholder editor), `EngineerJobDetailPage.tsx` (hazards, keyholders), `AddDevicePage.tsx` (system picker).

**Tests to add:** coverage maths (0 devices, not_tested, no tests); scanner payload parsing.

## Batch 12 — Import, cleanup, docs (M) · H25 M19 L3 L5 L6 L8–L13

- Import: papaparse, Dexie lookups at import time, skipped-rows report, dedupe, validation, flush after import.
- CSV export: neutralise formulas.
- Untrack `.claude/settings.local.json`.
- Update CLAUDE.md and DECISIONS.md to match the code (`App.tsx`; Decisions 3 and 7).
- Add security headers in `vercel.json`.
- Change customer/site cascades to `restrict` or soft delete.

---

## Duplicated logic to consolidate

| Logic | Current copies | Target |
|---|---|---|
| Job status labels and colours | `components/ui/statusColors.ts`, `ManagerJobsListPage.tsx:32-41`, `ReportsPage.tsx:108-109`, raw values in `GlobalSearch.tsx:166` | `src/lib/jobStatus.ts` |
| Allowed status transitions | implied in `TodayPage.tsx:90`, `EngineerJobDetailPage.tsx:117-130`, `ReviewJobsheetPage.tsx:87`, `CreateJobPage.tsx:65`, `FillJobsheetPage.tsx:114` | `jobStatus.ts` + `set_job_status` RPC |
| Job type labels | `PlannerPage.tsx:60-74`, `TodayPage.tsx:12-18`, `JobDetailPage.tsx:25-31`, `JobCard.tsx` | `src/lib/meta.ts` |
| Template labels | `CreateJobPage.tsx:12-20`, `JobCard.tsx:7-12` (4 only) | derived from `templates/*.json` |
| System type labels | `SiteDetailPage:26`, `SystemDetailPage:20`, `CustomerDetailPage:20`, `ContractDetailPage:9`, `ContractsListPage:8`, `useDashboardStats:56`, `CreateSitePage:9-15`, `CreateContractPage:9` | `meta.ts` |
| Contract frequency/status labels and chips | `ContractsListPage:16,23`, `ContractDetailPage:17,24`, `CreateContractPage:9-22`, `ReportsPage:333`, `SiteDetailPage:34`, `CustomerDetailPage:28` | `src/lib/contracts.ts` |
| Totals and VAT maths, `VAT_OPTIONS` | `CreateQuotePage:16,22-34`, `QuoteDetailPage:17,141,220`, `CreateInvoicePage:22,47-57,436`, `InvoiceDetailPage:270,326` | `src/lib/money.ts` |
| Date formatting / "today" | `formatDate` in 5+ variants; `toISOString().slice(0,10)` in `TodayPage`, `EngineerJobsPage`, `useDashboardStats`, `CreateJobPage`; local `toISO` in `PlannerPage` | `src/lib/dates.ts` |
| Online detection | `lib/useOnline.ts` vs inline listeners in `TodayPage.tsx:30-40` | `useOnline` |
| Device type formatting | `SiteDevicesPage.tsx:9`, `DeviceDetailPage.tsx:9` | `meta.ts` |
| "Open remedial" definition | dashboard `=== 'open'` vs reports `!== 'done'` | one predicate |
| Audit row on submit | client enqueue (`FillJobsheetPage.tsx:119`) + DB trigger (`00004:61`) | trigger only |
| Dexie-vs-Supabase read pattern | about 15 hand-written variants, several with dead `catch` | one `useCachedQuery` helper |

## Dead code to remove (or wire up)

| Item | Action |
|---|---|
| `src/pages/manager/AssignEngineerPage.tsx`, `SiteHistoryPage.tsx` | Delete (replace the router redirects with absolute paths) |
| `src/pages/manager/ReviewJobsheetPage.tsx` | Move its PDF link and review action into JobDetailPage, then delete |
| `src/pdf/SampleReportViewer.tsx` (untracked) | Fix and route behind a dev flag, or delete |
| `src/hooks/useJobsheet.ts`, `usePhotos.ts`, `useJobLines.ts`, `useNotificationCount.ts` | Wire up (`usePhotos` in Batch 5, `useNotificationCount` in Batch 7) or delete |
| `src/components/PhotoGrid.tsx`, `src/components/layout/TopBar.tsx`, `src/form-engine/fields/index.ts` | Delete (TopBar's sign-out is replaced in Batch 3) |
| `syncEngine` `storage_upload` branch | Becomes live in Batch 5 |
| `useSync.forceSync` | Use it from the sync issues screen, or delete |
| `FormEngine` `onSave`, `repeatCounts`, `companyId` props; `useFormState` `save` export | Delete |
| `SyncStatusBanner` `prevQueueRef` | Delete |
| `ImportPage` `getMappedValue` | Delete |
| `SiteDetailPage` unused devices fetch and the `'__devices_unused__'` tab | Replace with a real Devices tab (Batch 11) |
| `price_list_items` (Dexie table and type) | Build the UI (Batch 10) or drop the table |
| Every `catch { Dexie fallback }` that can't run | Fixed by Batch 6 |

## Tests that are missing (summary)

The only tests are `remedialDetector` (good coverage), `syncEngine` (4 trivial cases) and 6 e2e tests on public routes.

There are no tests for:
- RLS of any kind
- status transitions
- date maths
- the submit flow
- the planner
- PDF rendering
- photos
- quotes/invoice maths
- contracts
- devices
- import
- auth/onboarding

Each batch above lists the tests it adds.
