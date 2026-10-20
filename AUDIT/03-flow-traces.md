# 03 — End-to-end flow traces

Each flow follows the actual code path, step by step.

**Markers:**
- 🔴 BREAK: the flow stops or produces wrong data
- 🟠 LOSS: data is lost or duplicated
- 🟡 MANUAL: the step depends on the user doing something the UI doesn't prompt
- ⛔ MISSING: no code exists for this step

Finding IDs refer to `04-findings.md`.

---

## 1. PPM loop

| # | Step | Code path (function → table / API) | Result |
|---|---|---|---|
| 1 | Contract visit falls due | `contracts.next_visit_due` is set once in `CreateContractPage.handleSubmit` → `supabase.from('contracts').insert` (error ignored) | 🟡 Shown only on the dashboard card (`useDashboardStats` upcomingVisits). Off by one in BST. No reminder exists (⛔). |
| 2 | Job generated from the visit | — | ⛔ **No code.** The manager must notice the due date and create the job by hand in `CreateJobPage` (🟡). Even a manually added visit has `job_id: null` (`ContractDetailPage.tsx:124`). [C12] |
| 3 | Job appears in planner, unassigned | `CreateJobPage.handleSubmit` → `db.jobs.put` → `supabase.from('jobs').insert(job)` with `scheduled_time` | 🔴 The insert is rejected (no column, C4; a CHECK violation if one of the 3 new templates is chosen, C5). The error is ignored and the job exists only in this manager's Dexie. The planner reads `useJobs` from Supabase, so the job is **not** in the planner after a refresh. |
| 4 | Scheduled (drag to engineer + hour) | `PlannerPage.handleDragEnd` → `db.jobs.update` → `enqueueSync(upsert full row + scheduled_time)` | 🔴 The card snaps back (no state update). Status stays `unassigned` (H14). The queue isn't flushed while online (C6). When it flushes, it fails on `scheduled_time` (C4) 5×, then dies. No clash check (H15). |
| 5 | Engineer sees it offline | `TodayPage` / `EngineerJobsPage` → `useJobs({date, engineerId})` → Supabase (RLS: assigned only), then `db.jobs.bulkPut` | 🟡 Works only if the engineer opened the list online beforehand; site, customer and system are cached only if those pages were opened too. On `EngineerJobsPage` the date navigation is broken in BST (H17, confirmed by running). |
| 6 | Engineer starts | `EngineerJobDetailPage.startJob` (only if status = `scheduled`) → `db.jobs.put` → `enqueueSync(upsert)` | 🔴 Because of step 4 the status is still `unassigned`, so **no Start button** (C10). If it was `scheduled`: the queue isn't flushed (C6), and the upsert is denied by RLS for engineers (C7). |
| 7 | Device tests on the service sheet | `FillJobsheetPage` → `FormEngine` → `fire_alarm_service.devices_tested` (free-text zone + `pass_fail_note`) | ⛔ No link to `devices` / `device_tests` (H19). Scanning a device sends the engineer to a manager route and bounces them (H18). |
| 8 | Failed device → remedial | `handleSubmit` → `detectRemedials` → `db.remedials.put` + `enqueueSync(remedials)` | 🟡 A remedial is raised from the failed `zone_result`, but the description doesn't say which zone (M9). 🟠 Duplicates on double tap or resubmit (H11). 🔴 It doesn't reach the server while online (C6). Blocked for new templates (C5). |
| 9 | Remedial → quote | `CreateQuotePage` (manual, from the Quotes list) | ⛔ No "quote this remedial" action. `remedial_id` is always null. Remedial status isn't changed (H21). Writes unchecked (C17). |
| 10 | Customer accepts via public link | — | ⛔ **No public route, token, RPC or email.** "Send" opens an empty `mailto:` and marks the quote `sent` (H21). The manager must set `accepted` by hand (🟡). |
| 11 | Remedial works job created | — | ⛔ No quote → job path. Manual `CreateJobPage` with type `remedial_works` (fails per step 3). |
| 12 | Job completed | Engineer path per steps 6–8 → `awaiting_review` (queue) | 🔴 As above. The manager can never set `reviewed` (C13). Remedials are never marked `done` (⛔). |
| 13 | Contract next-due updated | — | ⛔ Never happens. The contract shows "Overdue" forever (C12). |

**Verdict:** the loop is broken at step 2 (missing) and step 3 (job insert fails). From step 9 to the end the steps either don't exist or need manual work.

---

## 2. Reactive loop

| # | Step | Code path | Result |
|---|---|---|---|
| 1 | Manager creates reactive job | `CreateJobPage` → `supabase.from('jobs').insert` (type `reactive_callout`, template `reactive_callout`) | 🔴 Rejected for `scheduled_time` (C4). Error ignored, job local-only. *(If the column was added on the hosted DB by hand, this step works for the 4 original templates.)* |
| 2 | Assigned | In the create form: status `scheduled`. Or later in `JobDetailPage.handleReassign`: direct update + full-row queue item | 🟡 Reassign doesn't change status. The queued full row can later undo newer edits (H8). |
| 3 | Engineer: travelling | `TodayPage.updateJobStatus('travelling')` → `db.jobs.update` → `enqueueSync(upsert full row)` | 🔴 Not flushed (C6). Denied by RLS (C7). **The buttons disappear and the detail page has no action for `travelling`** (C10). The buttons are also disabled offline. |
| 4 | On site | Today "On site" (only from `scheduled`) or detail "Start Job" (only from `scheduled`) | 🔴 Unreachable after step 3 (C10). |
| 5 | Completed (offline) | Today "Complete" → status `completed` | 🔴 No jobsheet path from `completed` (C10). The normal path skips `completed` and `completed_at` is never set. |
| 6 | Jobsheet filled offline | `FillJobsheetPage.init`: Dexie, else Supabase, else new jobsheet (random id) + enqueue; `useFormState` 2 s debounce | 🟠 Photos are object URLs only, lost on reload (C8). Signatures are base64 in answers (C9). Edits from the last 2 s are lost on Back (M5). Offline with empty Dexie, a server jobsheet already exists → `unique(job_id)` conflict (H10). |
| 7 | Submitted | `handleSubmit` → remedials, jobsheet (`submitted_at`), full job row (`awaiting_review`), audit row → all `enqueueSync` → navigate to `/submitted` | 🟠 Double-submit duplicates (H11). Silently does nothing if the site isn't cached (M8). `JobSubmittedPage` shows "Saved offline" even when online. |
| 8 | Sync on reconnect | `online` event → `flushQueue` → upsert jobsheet, remedials, job, audit_log | 🟡 Jobsheet and remedials insert OK (for the 4 original templates). 🔴 Job upsert denied (C7), so the job never reaches `awaiting_review` on the server. Audit upsert is possibly denied (H23). The trigger also writes a second audit row with the wrong user (M2). |
| 9 | PDF generated | `flushQueue` → `triggerPDFGeneration(jobsheetId)` → reads Dexie job/site/customer/**first company profile**/company/photos/remedials → `generateAndUploadPDF` → upload `pdfs/{co}/{js}/report.pdf` → `getPublicUrl` → `jobsheets.update({pdf_url})` | 🟡 Upload works. 🔴 `pdf_url` is a public URL on a private bucket, so the link is dead (C11). Wrong engineer named, no photos, "Not signed", `[object Object]` in repeatable rows (H12, C8, C9). Any missing cache entry means a silent skip with no retry (H13). |
| 10 | Stored privately | bucket `pdfs` (private), RLS on the first folder = company | ✅ Private storage. (M21: any member can overwrite or delete.) |
| 11 | Emailed | — | ⛔ No email code or Edge Function (H13). |
| 12 | Manager reviews | `JobDetailPage` jobsheet tab: Dexie-first jobsheet → read-only FormEngine | 🟡 It may show "No jobsheet submitted" from a stale cache (M16). No PDF link on this page. Dead `blob:` photos. |
| 13 | Job marked reviewed | `ReviewJobsheetPage.markReviewed` | 🔴 **Unrouted.** `/manager/jobs/:id/review` redirects to `/` (C13). The job sits in `awaiting_review`, or rather stays `on_site`/`scheduled` on the server because of step 8. |

**Verdict:** broken at steps 1 (C4), 3 (C6, C7, C10), 9 (C11) and 13 (C13). Email is missing.

---

## 3. Onboarding loop

| # | Step | Code path | Result |
|---|---|---|---|
| 1 | New manager signs up | `LoginPage` → `signInWithOtp({email, emailRedirectTo})` (`shouldCreateUser` default true) → `auth.users` insert → `handle_new_user` | 🟡 The trigger finds no `company_id` in metadata and returns, so **no profile** (00004:22-24). |
| 2 | Lands in the app | `AuthCallbackPage` → profile null → navigate `/jobs` → `AuthGuard` (`effectiveRole` undefined, so it falls through) → engineer shell | 🔴 Empty Today/Jobs screens, no message (M3, H4). |
| 3 | Creates company | — | ⛔ No UI, and no INSERT policy on `companies` (H4). The only routes are an operator running SQL, or the C2/C3 exploit. |
| 4 | Default templates seeded | — | · Templates are bundled JSON files, not per-company rows. Nothing to seed, but there's no per-company template enablement either. |
| 5 | Invites engineer | — | ⛔ No invite UI or Edge Function. A dashboard invite creates a user with no metadata, so no profile (H4). Decision 8's "placeholder entry" isn't implemented. |
| 6 | Engineer logs in on phone | Same as step 1 | 🔴 Without a profile: empty screens. With a profile created by SQL: OK. Profile cached in Dexie forever (H5). |
| 7 | Installs the PWA | `vite-plugin-pwa` manifest + `registerSW({immediate:true})`, `registerType: 'autoUpdate'` | 🟡 Installable via the browser menu only; there's no install prompt (`beforeinstallprompt`) or guidance in the UI. `autoUpdate` can reload mid-form and drop the pending save (M5). |
| 8 | Completes first job | Reactive loop steps 3–13 | 🔴 See trace 2. |
| — | Signs out | `BottomNav` | ⛔ **Engineers have no sign-out** (C15). |

**Verdict:** there's no self-service onboarding at all. Steps 1–5 need an operator.

---

## 4. Data isolation (second company tries the demo company's data)

| # | Surface | Mechanism | Result |
|---|---|---|---|
| 1 | Every list and screen (jobs, sites, customers, quotes, invoices, contracts, remedials, devices, profiles) | RLS `company_id = get_my_company_id()` on every table | ✅ By policy. Server reads are scoped (Read★: live check blocked). |
| 2 | Planner and dashboard | Same hooks / RLS | ✅ By policy. |
| 3 | Global search | Searches **Dexie only**, no company filter | 🔴 On a shared device, user B sees user A's cached company data (C15). |
| 4 | Scanner | Dexie `where('qr_code')` first, no company check | 🔴 Same shared-device leak (C15). Server lookup is RLS-scoped ✅. |
| 5 | Detail pages by URL id | Dexie-first `get(id)` | 🔴 Same shared-device leak; server ✅. |
| 6 | Storage paths | Policy: first folder = caller's company | ✅ By policy for cross-company access. Within a company, any member can overwrite or delete (M21). |
| 7 | PDF links | `getPublicUrl` on a private bucket | ✅ No leak (the link is simply dead, C11). The URL exposes the company UUID, which feeds C2/C3. |
| 8 | Public links | None exist | ✅ No exposure (a public quote link is a missing feature). |
| 9 | Workbox HTTP cache | Shared `supabase-cache`, keyed by URL | 🔴 The previous user's API responses can be served after a user switch (H6). |
| 10 | Becoming a member of the demo company | `profiles_insert_own` / `profiles_update_own` / `handle_new_user` metadata | 🔴 **Critical.** Company B's manager (or anyone who signs up) can insert or move their profile into company A as manager, or self-promote (C1–C3). After that, *every* surface above is open. |
| 11 | Forging audit rows in company A | `rpc('log_audit_event', …)` as anon or any user | 🔴 Possible (M1). |
| 12 | Squatting company A's jobsheet slot | `jobsheets` insert with A's `job_id` (FK ignores RLS) | 🔴 Possible if the UUID is known (H1). |

**Verdict:** row-level reads are isolated. Role and membership integrity is not, so isolation can be bypassed in one request. Devices also leak between users locally.

---

## 5. Sync failure (submit offline, close, reopen on poor signal, photo upload fails twice then succeeds)

| # | Step | Code path | Result |
|---|---|---|---|
| 1 | Submit offline | `handleSubmit` → Dexie puts + 4 kinds of `enqueueSync` (not in a transaction) | 🟡 Queued. If the app is killed mid-loop, partial remedials are left; a re-submit duplicates them (M7, H11). |
| 2 | Photos at submit | — | 🟠 **No photo is ever queued.** Answers hold `blob:` URLs only (C8). |
| 3 | Close app | — | 🟠 `blob:` URLs are invalidated: **photos are permanently lost**. Any unsaved debounce is lost (M5). |
| 4 | Reopen on poor signal | `App.tsx` → `startSyncEngine` → `flushQueue` (if `navigator.onLine`) | 🟡 One pass. Each failure (timeouts, blips) adds 1 to `attempts` with no backoff. Children keep running after a parent fails, so remedials fail on the FK and burn attempts too (M7, H9). |
| 5 | "Photo upload fails twice then succeeds" | `storage_upload` branch | ⛔ Unreachable: no producer exists. If it existed: retries happen only on a new `online` event or restart (C6). After success it updates the `photos` row, but that row was never inserted, and `photos` has no UPDATE policy, so the result is ignored. |
| 6 | Retries | Next `online` event / app restart only (C6) | 🔴 After 5 failed passes every item is dead forever, with no UI to retry or discard (H9). Poor signal toggles `online` often, which burns attempts quickly. |
| 7 | Job status | upsert full row | 🔴 Denied by RLS (C7), so it dies after 5 attempts regardless of signal. |
| 8 | Duplicates | jobsheet upsert by id ✅ idempotent; remedials random id + upsert ✅ idempotent per item; audit_log upsert by id ✅ | 🟡 Replaying the *same* queue item is idempotent, but a retry after a lost response hits the UPDATE path, which engineers lack, so the item is marked failed although the data is saved (H23). Duplicates come from re-submit (H11), not from replay. |
| 9 | PDF | Triggered after the jobsheet item succeeds | 🟡 Generated with no photos, "Not signed" and a dead URL. If it fails it is never retried (H13). |
| 10 | User sees | `SyncStatusBanner` "N items couldn't sync"; `JobSubmittedPage` "Saved offline" | 🔴 No detail, no action. A stuck item makes every future submit look offline (H9). |
| 11 | User switch before sync | — | 🟠 The queue flushes under the next user's JWT (C15). |

**Verdict:** photos are guaranteed lost. The job status is guaranteed stuck. Other items are at risk of being stranded permanently on a poor connection, with no recovery path.
