# 01 — Feature map: what each feature really does

Audit date 2026-10-19, working copy. Read alongside `00-inventory.md` (files/routes) and `04-findings.md` (IDs in brackets).

Verdict scale: **Works** · **Partial** · **Broken** · **Stub/missing**

---

## 1. Jobs & status — Broken

| Function / screen | Claimed | Actually does |
|---|---|---|
| `CreateJobPage.handleSubmit` | Creates a job | Writes to Dexie, then `supabase.from('jobs').insert(job)` with the result ignored. The payload includes `scheduled_time`, which has no DB column, and may use a template id the CHECK rejects. On the server the insert fails; the job lives only in this browser's Dexie and disappears on the next list refresh [C4, C5, C17] |
| `useJobs` | Supabase-first, Dexie fallback | Correct pattern (`if (err) throw err`), but adds a forbidden `.eq('company_id')` |
| `TodayPage.updateJobStatus` | Travelling / On site / Complete | Dexie update and enqueue only, never sent while online [C6]. Buttons show only while status is `scheduled`, so after one tap the job is stranded [C10]. The full-row upsert fails RLS for engineers [C7]. Buttons are disabled offline, despite the app being offline-first |
| `EngineerJobDetailPage.startJob` | Start job | `scheduled → on_site` (skips travelling) and enqueues only. No button for `travelling` or `completed` |
| `JobDetailPage` (manager) | Job hub | Tabs: overview, jobsheet (read-only form), remedials, lines (read-only), history ("coming soon"). There is no review, PDF, cancel or invoice action. Reads Dexie first, so it shows stale data |
| `JobDetailPage.handleReassign` | Reassign | Writes both a direct update and a full-row queue item that replays later and can undo newer edits. Status is not changed |
| Status `reviewed` / `invoiced` / `cancelled` | Workflow | **Never set by any routed code.** Only the unrouted `ReviewJobsheetPage` sets `reviewed` [C13] |
| `travelling_at` / `on_site_at` / `completed_at` | Timestamps | Set only by the Today buttons and Start. `completed_at` is never set on the normal path |
| Activity timeline | — | Missing. `audit_log` is written (twice, with the wrong attribution) and never read |

## 2. Planner — Broken

| Function | Actually does |
|---|---|
| `handleDragEnd` | Computes the engineer, date and hour, then `db.jobs.update` and enqueues a full row including `scheduled_time` (no column) [C4]. React state isn't updated, so the card snaps back. It isn't flushed while online [C6]. Status stays `unassigned` [H14] |
| Clash detection | **Does not exist.** There is no duration field; jobs stack in a cell [H15] |
| Unassigned lane | Shows only the selected date, so overdue unassigned work is invisible. Closed and invoiced jobs are draggable |
| Dates | Local `toISO` is correct here, unlike other pages |

## 3. Jobsheets & form engine — Partial

| Function | Actually does |
|---|---|
| `FillJobsheetPage.init` | Dexie, then Supabase, else creates a new jobsheet with a random id and enqueues it. Offline with Dexie empty, this collides with the server's `unique(job_id)` [H10] |
| `FormEngine` / `FormSection` | Renders all 9 field types used by the 7 templates. Validation skips repeatable sections, and `pass_fail_note {result:null}` passes as answered [M] |
| `useFormState` | 2 s debounced Dexie save. The pending save is dropped on unmount and save errors are swallowed [M] |
| `PhotoField` | Stores only `URL.createObjectURL(file)` in answers. **No blob saved, no upload**; the photos are lost on reload [C8] |
| `SignatureField` | Stores a base64 PNG data URL inside answers as `storage_path`. The `*_signature_url` columns are never set [C9] |
| `handleSubmit` | Detects remedials (random ids), enqueues remedials, jobsheet, full job row (`awaiting_review`) and an audit row. No direct write, no flush, no double-submit guard, no submitted check [C6, H11] |
| `remedialDetector` | Pure and correct for `pass_fail_note`, `yes_no_na` and `_free_text`. Repeatable descriptions lack the instance id; the new templates' defect fields are ignored |

## 4. Offline sync — Broken

| Function | Actually does |
|---|---|
| `enqueueSync` | Adds a row to Dexie `sync_queue`. Doesn't trigger a flush and isn't stamped with a user |
| `flushQueue` | Re-entrancy guard OK. Processes everything by `created_at`, as full-row upserts. Failed parents don't block children. No backoff; 5 failures means dead forever. Not gated on having a session |
| `startSyncEngine` | Flushes at start-up and on the `online` event only (called in `App.tsx`, not `main.tsx` as documented). The 5 s timer only counts |
| `storage_upload` branch | Dead: no code produces it |
| `useSync.forceSync` | Never called |
| `SyncStatusBanner` | Shows queued/failed counts with no action and no view of `last_error` |
| Workbox runtime cache | Caches every `*.supabase.co` GET (REST, auth, storage) for 24 h, keyed by URL and not by user [H6] |

## 5. PDF — Broken

`triggerPDFGeneration` runs only after a submitted jobsheet item syncs. It gathers its data from Dexie and silently returns if anything is missing. The engineer is "the first profile in the company" [H12]. It renders `JobsheetPDF`, uploads to `pdfs/{company}/{jobsheet}/report.pdf` (path OK), then stores `getPublicUrl()` on a **private** bucket, so the link is dead [C11]. Photos never appear and the signatures say "Not signed". Repeatable pass/fail values print `[object Object]`. Times print as raw UTC ISO strings. There is no retry, no regenerate button and no email.

## 6. Review — Stub

`ReviewJobsheetPage` (PDF link and "Mark reviewed") is not routed; `/manager/jobs/:id/review` redirects to `/`. JobDetailPage shows the answers read-only, with dead `blob:` photos.

## 7. Remedials — Partial

Created at submit (duplicates possible) and listed on `/manager/remedials` with a status dropdown. The dropdown write goes Dexie + Supabase unchecked, with no queue. It is never linked to quotes or jobs, and there are no automatic status changes. "Open" means `status==='open'` on the dashboard but `!=='done'` in reports.

## 8. Quotes & price list — Partial / missing

The quote builder (manual lines, VAT 0/5/20) writes without checking errors or queueing. `remedial_id` is always null. "Send" opens an empty `mailto:` and marks the quote sent. Lines stay editable after acceptance. **Price list: table only, no UI. Public accept link: does not exist** (no route, token, RPC or policy). Quote → job: missing. Quote → invoice: a manual copy that allows duplicates and mismatched customer/site, and loses 5% VAT on import.

## 9. Contracts — Stub (records only)

The create form takes a site, system *type* (`system_id` always null), frequency and first due date. The detail page allows a status change and adding visits by hand. **`visit_frequency` is never used. `next_visit_due` never changes after creation. No job generation, no visit completion, no reminders, no expiry automation.** Writes are online-only with errors ignored. "Overdue" is computed only on the dashboard, with off-by-one errors in GMT and BST.

## 10. Customers, sites, systems — Partial

Create: customer (name only), site and one system in one form, with unchecked writes. **There is no edit UI** for any of them. ARC, police URN, hazards and keyholders can only come from CSV import; keyholders are always `[]`. **Clicking a site in the Sites list lands on the dashboard** [C16]. Engineers never see hazards or keyholders. `CustomerDetailPage` "Created" renders as garbage.

## 11. Devices & QR — Partial

Add device (manager route only; no link from the site page when a site has 0 devices). Manual test recording (manager only, `jobsheet_id` null). QR label = bare UUID, so a phone camera app doesn't open the app. `/scan` exists for both roles, but its "View device" goes to a manager-only route, so **engineers are bounced to `/jobs`** [H18]. No device tests from the service sheet, no remedial on a failed test, no coverage calculation.

## 12. Invoices — Partial

Manual create with reference = local Dexie count + 1, so collisions are possible. Can import quote lines; job lines can't be written anywhere, so there are none to import. Never sets job `invoiced` and doesn't filter jobs already invoiced. No invoice PDF, no email, no automatic overdue.

## 13. Dashboard & reports — Partial

Charts from five hook fetches. Counts include cancelled and closed jobs. "Today" is the UTC date. Links pass `?status=` / `?priority=`, which the target pages ignore. Reports show CSV export with no formula-injection guard.

## 14. Search & import — Partial

GlobalSearch searches Dexie only, with no company scope, so on a shared device it shows the previous user's company data. Import: the naive `split(',')` breaks on UK addresses. Lookups are stale within one visit, unmatched rows are skipped silently, and writes are queue-only with no flush.

## 15. Auth, companies & security — Broken

Magic-link login works. **Role integrity is broken at the database level** [C1–C3]. No company creation, no invites and no team management. The profile is cached forever in Dexie. Logout clears nothing; engineers have no logout button at all. `AuthGuard` renders protected routes when `profile` is null. `previewRole` is a UI-only "engineer view" for managers that performs real writes as the manager; it isn't a data-isolated demo mode.
