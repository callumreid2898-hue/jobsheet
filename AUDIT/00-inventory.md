# 00 — Feature inventory

Audit date: 2026-10-19 · Working copy of `master` @ 9c6137b plus uncommitted changes (Planner rewrite, preview role, 3 new templates).
Read-only: no source files were changed. This replaces an earlier unverified draft of this file.

Scale: ~11.4k lines TS/TSX, 8 migrations, 7 templates, 3 test files (17 unit tests, 6 e2e smoke tests).

## Global plumbing

| Piece | Files | Notes |
|---|---|---|
| Boot | `src/main.tsx`, `src/App.tsx` | `registerSW`, `startSyncEngine()` at module load of App.tsx |
| Routing | `src/router/index.tsx` | `<M>` = manager guard + shell, `<E>` = engineer guard + shell; `/scan` both roles; `*` → `/` |
| Auth | `src/auth/AuthProvider.tsx`, `AuthGuard.tsx`, `LoginPage.tsx`, `AuthCallbackPage.tsx` | Magic link only; profile/company cached in Dexie; `previewRole` (uncommitted) |
| Offline DB | `src/lib/db.ts` (Dexie v1–v4, 20 tables) | No `audit_log` table |
| Sync | `src/offline/SyncQueue.ts` (`enqueueSync`), `src/lib/syncEngine.ts` (`flushQueue`, `startSyncEngine`), `src/offline/useSync.ts`, `SyncStatusBanner.tsx` | Flush only on startup and `online` event |
| PWA cache | `vite.config.ts` | Workbox NetworkFirst cache of every `*.supabase.co` GET |
| Backend | `supabase/migrations/00001–00008`, `supabase/seed/seed.sql` | RLS on every table; no Edge Functions, no cron |

## Features

| # | Feature | Main files | Tables | Entry points (screens · hooks · functions) |
|---|---|---|---|---|
| 1 | Jobs & status | `pages/manager/CreateJobPage`, `ManagerJobsListPage`, `JobDetailPage`; `pages/engineer/TodayPage`, `EngineerJobsPage`, `EngineerJobDetailPage`; `components/JobCard`, `ui/StatusPill`, `ui/statusColors` | `jobs`, `job_lines` | `/manager/jobs`, `/manager/jobs/create`, `/manager/jobs/:jobId`, `/today`, `/jobs`, `/jobs/:jobId` · `useJobs`, `useJobLines`, `useProfiles` |
| 2 | Planner | `pages/manager/PlannerPage` (dnd-kit) | `jobs` | `/manager/planner` · `handleDragEnd` → Dexie + `enqueueSync` |
| 3 | Jobsheets & form engine | `pages/engineer/FillJobsheetPage`, `JobSubmittedPage`; `form-engine/*`; `templates/*.json` | `jobsheets`, `photos` | `/jobs/:jobId/fill` · `useFormState`, `useJobsheet`, `usePhotos` · `FormEngine`, `detectRemedials` |
| 4 | Offline sync | `offline/*`, `lib/syncEngine.ts`, `lib/db.ts` | Dexie `sync_queue` | `enqueueSync`, `flushQueue`, `SyncStatusBanner` |
| 5 | PDF | `pdf/generatePDF.ts`, `JobsheetPDF.tsx`, `PDFSections.tsx`, `SampleReportViewer.tsx` (untracked) | `jobsheets.pdf_url`, bucket `pdfs` | `generateAndUploadPDF` (called only from `syncEngine.triggerPDFGeneration`) |
| 6 | Review | `pages/manager/JobDetailPage` (review tab), `ReviewJobsheetPage` (orphaned — route redirects) | `jobsheets`, `jobs` | `/manager/jobs/:jobId` |
| 7 | Remedials | `form-engine/remedialDetector.ts`, `pages/manager/RemedialsListPage`, `components/RemedialRow` | `remedials` | `/manager/remedials` · `useRemedials` |
| 8 | Quotes & price list | `pages/manager/CreateQuotePage`, `QuotesListPage`, `QuoteDetailPage` | `quotes`, `quote_lines`, `price_list_items` | `/manager/quotes*` · `useQuotes` (no public accept route exists) |
| 9 | Contracts | `pages/manager/ContractsListPage`, `CreateContractPage`, `ContractDetailPage` | `contracts`, `contract_visits` | `/manager/contracts*` · `useContracts` |
| 10 | Customers / sites / systems | `CustomersListPage`, `CustomerDetailPage`, `SitesPage`, `CreateSitePage`, `SiteDetailPage`, `SystemDetailPage` | `customers`, `sites`, `systems` | `/manager/customers*`, `/manager/sites*`, `/manager/systems/:id` · `useCustomers`, `useSites`, `useSystems` |
| 11 | Devices & QR | `SiteDevicesPage`, `AddDevicePage`, `DeviceDetailPage`, `DeviceQRPage`, `pages/ScannerPage` | `devices`, `device_tests` | `/manager/sites/:siteId/devices*`, `/scan` · `useDevices` |
| 12 | Invoices | `InvoicesListPage`, `CreateInvoicePage`, `InvoiceDetailPage` | `invoices`, `invoice_lines` (+ reads `job_lines`, `quote_lines`) | `/manager/invoices*` · `useInvoices`, `useInvoiceLines` |
| 13 | Dashboard & reports | `DashboardPage`, `ReportsPage`, `hooks/useDashboardStats`, `useNotificationCount` | reads jobs, remedials, contracts, invoices, sites | `/manager/dashboard`, `/manager/reports` |
| 14 | Search & import | `components/ui/GlobalSearch`, `pages/manager/ImportPage` | reads many; import writes customers/sites/systems/devices | top bar · `/manager/import` |
| 15 | Auth, companies, settings | `auth/*`, `SettingsPage`, layout `AppShell`/`Sidebar`/`OfficeShell`/`BottomNav` | `companies`, `profiles`, `audit_log` | `/login`, `/auth/callback`, `/manager/settings` · trigger `handle_new_user`, fn `log_audit_event`, trigger `log_jobsheet_submitted` |

## Status vocabularies (as defined in DB)

- `jobs.type`: reactive_callout, ppm_service, install, remedial_works, survey (00008)
- `jobs.status`: unassigned, scheduled, travelling, on_site, completed, awaiting_review, reviewed, invoiced, cancelled (00008)
- `jobs.template_id` / `jobsheets.template_id`: **only** reactive_callout, fire_alarm_service, emergency_lighting_test, cctv_maintenance (00001, never widened). TS `TemplateId` has 7.
- `remedials.status`: open, quoted, done · `quotes.status`: draft, sent, accepted, rejected · `contracts.status`: active, paused, expired · `contract_visits.status`: pending, scheduled, complete · `invoices.status`: draft, sent, paid, overdue, void · `device_tests.result`: pass, fail, not_tested

## Columns in TS types but not in any migration

- `jobs.scheduled_time` (`types/index.ts:135`, written by CreateJobPage, PlannerPage, indexed in Dexie v4)

## Orphans / stubs

- `pages/manager/AssignEngineerPage.tsx`, `SiteHistoryPage.tsx` (6-line stubs; routes redirect)
- `pages/manager/ReviewJobsheetPage.tsx` (not routed)
- `pdf/SampleReportViewer.tsx` (untracked; uses `require`, breaks `tsc`)
