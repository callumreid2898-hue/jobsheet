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

All hooks follow a **Supabase-first, Dexie-fallback** pattern:
1. Try to fetch from Supabase (online).
2. On error/offline, fall back to local Dexie cache.
3. On successful Supabase fetch, call `db.table.bulkPut(result)` to keep cache warm.

**Never** filter rows by `company_id` in React — this is handled entirely by RLS. The Supabase query just calls `.select('*')` and RLS returns only the caller's data.

### Write Pattern (Online + Offline)

All writes must:
1. Write to Dexie immediately (optimistic).
2. If online, write to Supabase in the same tick.
3. If offline (or Supabase write fails), call `enqueueSync(...)` from `src/offline/SyncQueue.ts`.

### Form Engine

- `<FormEngine template jobsheetId companyId readOnly? onSave? onSubmit? />` — top-level renderer.
- `useFormState(jobsheetId, template)` — manages `answers: AnswersMap`, debounced Dexie save every 2 s.
- Repeatable section answers live at `answers[sectionId + '_instances']` as `AnswersMap[]`.
- Remedial auto-detection: `detectRemedials(template, answers, jobsheetId, siteId, companyId)` — pure function, safe to call any time.

### PDF

- `generateAndUploadPDF(...)` in `src/pdf/generatePDF.ts` renders the PDF client-side, uploads to the `pdfs` bucket, updates Supabase + Dexie, and returns the public URL.
- PDF generation is **skipped when offline**. The sync engine calls it automatically after flushing the jobsheet.
- Never import `@react-pdf/renderer` at the top level of a page — it is large. Use dynamic import or keep it in `src/pdf/`.

### Sync Engine

- `startSyncEngine()` is called once in `src/main.tsx`.
- `flushQueue()` is idempotent; calling it while already syncing returns `{ synced: 0, failed: 0 }`.
- Items with `attempts >= 5` are considered permanently failed and are skipped (but counted in `failedCount`).

### Routing & Auth

- `<AuthProvider>` wraps the entire app in `App.tsx`.
- `<AuthGuard roles={['engineer']}>` / `<AuthGuard roles={['manager']}>` protects routes.
- Engineer routes: `/jobs`, `/jobs/:id`, `/jobs/:id/fill`, `/jobs/:id/submitted`.
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
- Do not store blobs as base64 — use `Blob` in Dexie, `storage_path` in DB.
- Do not call `startSyncEngine()` more than once — it is guarded by `if (started) return`.
- Do not import `@react-pdf/renderer` outside `src/pdf/`.
- Do not add `tailwind.config.ts` — Tailwind v4 uses CSS-based config only.
