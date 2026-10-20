# Architecture Decision Records

## Decision 1 — `template_id` on `jobs` table

**Context:** A jobsheet needs to know which template to render. The template could be stored on the jobsheet itself, or on the job that the jobsheet belongs to.

**Decision:** Store `template_id` on the `jobs` table. The manager picks the template when creating the job, filtered by `system_type`. The engineer cannot change it.

**Rationale:** The template is a property of the job (what type of work is being done), not the sheet (the filled-in form). Keeping it on `jobs` lets the manager plan correctly. The `jobsheet` then copies `template_id` on creation so the PDF renderer does not need to query `jobs`.

---

## Decision 2 — Photos as `Blob` in Dexie, not base64

**Context:** Photos need to survive offline and be uploaded to Storage when back online.

**Decision:** Photos (re-encoded as JPEG, max 1600px) are stored as binary in `db.blobs`, keyed by the storage path they'll be uploaded to. They're uploaded when the jobsheet is submitted, and removed from the device once the PDF is made.

**Rationale:** Base64 strings are ~33% larger and cannot be efficiently streamed. The bytes are stored as an `ArrayBuffer` plus MIME type rather than a `Blob`, because some browsers (older iOS Safari, Chromium private contexts) fail to store Blobs in IndexedDB. *(Updated in audit batch 5.)*

---

## Decision 3 — Signatures uploaded to Storage, URL on `jobsheets`

**Context:** Signatures are captured as canvas data URLs (PNG). They need to be persisted and appear in the PDF.

**Decision:** `signature_pad` captures a PNG, saved like a photo (`db.blobs`) at `{company}/{jobsheet}/signatures/{engineer|customer}.png` in the `photos` bucket. On submit it's uploaded and the **path** is stored on `jobsheets.engineer_signature_url` / `customer_signature_url` (the bucket is private, so there's no lasting URL).

**Rationale:** Storing raw base64 in Postgres would bloat the `jobsheets` JSONB column. Uploading to Storage keeps the DB lean; the PDF renderer embeds the image from the device or a storage download. *(Updated in audit batch 5.)*

---

## Decision 4 — Repeatable sections as `{ sectionId_instances: AnswersMap[] }`

**Context:** Some sections (e.g. "zones tested", "devices") may repeat N times. Answers must be stored and retrieved correctly.

**Decision:** Repeatable section answers are stored in the flat `AnswersMap` under the key `sectionId + '_instances'` as an array of `AnswersMap`.

**Rationale:** This avoids a nested schema and keeps the JSONB structure flat enough for easy serialisation. The form engine reads and writes the array; the PDF renderer iterates over instances.

---

## Decision 5 — Free-text remedials split by newline

**Context:** Engineers often have several small remedials that don't map to a single template field failure.

**Decision:** A `longtext` field with `id` ending in `_free_text` is treated as a multi-remedial input. At submit time, each non-empty line becomes a separate `Remedial` row.

**Rationale:** A single long textarea is fast to fill on mobile. Splitting by newline on submit gives the manager a clean list in the remedials view.

---

## Decision 6 — PDF generation skipped offline; sync engine handles it on reconnect

**Context:** PDF generation requires `@react-pdf/renderer` which renders synchronously into a Blob, then uploads to Storage. Storage upload requires network.

**Decision:** Submit queues a `generate_pdf` item that waits for the jobsheet, uploads, photo rows, remedials and status change. The sync queue runs it when online and retries it like any other item. The PDF path is stored on `jobsheets.pdf_path` and opened through a signed URL. Managers can regenerate it. *(Updated in audit batch 5.)*

**Rationale:** Generating offline would succeed but the upload would fail, and generating before the photos are uploaded would leave them out. Putting it in the queue gives ordering and retries for free.

---

## Decision 7 — Last-write-wins on `updated_at`

**Context:** Multiple writes could theoretically race (e.g. engineer submits, manager updates status simultaneously).

**Decision:** All upserts overwrite existing rows. No version vectors or CRDTs.

**Rationale:** Each jobsheet is owned by exactly one engineer. The engineer cannot submit twice. Managers only update `status` on remedials, not the jobsheet body. Real collisions are essentially impossible in v1.

---

## Decision 8 — Multi-tenant invite via `raw_user_meta_data`

**Context:** Managers need to invite engineers to their company. Supabase Auth does not natively support custom invite flows.

**Decision:** When a manager sends an invite, they create a placeholder entry including `company_id` and `role`. The `handle_new_user()` Postgres trigger reads these from `raw_user_meta_data` on first sign-in and creates the `profiles` row automatically.

**Rationale:** This avoids a custom invite Edge Function in v1. The magic-link flow already covers authentication; the trigger handles onboarding.

---

## Decision 9 — No Realtime subscriptions in v1

**Context:** The manager dashboard could subscribe to Supabase Realtime to see live job status updates.

**Decision:** No Realtime subscriptions. Managers refresh manually.

**Rationale:** Realtime adds WebSocket connections, subscription management, and re-subscription logic on reconnect. For a v1 demo, manual refresh is sufficient. Realtime is noted in the roadmap.

---

## Decision 10 — `@react-pdf/renderer` over `pdf-lib`

**Context:** Two main options for client-side PDF: `pdf-lib` (low-level, direct PDF manipulation) and `@react-pdf/renderer` (React component tree → PDF).

**Decision:** `@react-pdf/renderer`.

**Rationale:** The jobsheet PDF has a structured layout: header, info bar, section-field table rows, photo grid, remedials table, signature boxes, footer. Expressing this as a React component tree is far more maintainable than constructing it imperatively with `pdf-lib`. The rendering performance is acceptable for a one-page document.
