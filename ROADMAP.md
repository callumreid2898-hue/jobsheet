# Roadmap

## v1 — Current (Demo-ready)

- Engineer mobile flow: log in → pick job → fill form offline → sign → submit
- Manager desktop flow: review jobsheet, download PDF, update remedial status
- Four templates: Reactive Callout, Fire Alarm Service, Emergency Lighting Test, CCTV Maintenance
- Offline-first with sync queue and status banner
- Multi-tenant from day one via Postgres RLS
- Client-side PDF with signature boxes, photos, remedials table

---

## v1.1 — Invite & Onboarding

- Manager invite flow: email invite with pre-filled `company_id` + `role` in magic-link
- Onboarding screen for first-time engineers (profile photo, contact number)
- Company settings: logo upload, accreditation number
- System types shown as icons on job cards

---

## v1.2 — Realtime & Notifications

- Supabase Realtime subscription on manager dashboard: live job status updates
- Push notifications (Web Push API) for engineer: "New job assigned"
- In-app notification badge for manager: unreviewed submissions

---

## v1.3 — Signatures & Compliance

- Customer signs directly on engineer's phone (signature canvas fullscreen)
- PDF flattening: lock PDF after customer signs
- Customer email copy: send PDF link automatically on submit
- Audit trail visible to managers

---

## v1.4 — Template Builder

- Manager can create custom templates via drag-and-drop field editor
- Templates stored in Postgres (`templates` table) rather than JSON files
- Version history: old jobsheets always render with the template version active at submission time

---

## v1.5 — Advanced Reporting

- Site history timeline: all jobsheets per site, pass/fail trend chart
- Remedials ageing: flag overdue open remedials
- Export: bulk CSV export of remedials by date range
- Manager dashboard KPIs: jobs this week, open remedials by priority

---

## v2 — Scheduling & Certificates

- Calendar view for managers: drag-and-drop job scheduling
- Automatic service interval reminders (e.g. 6-month fire alarm service due)
- Compliance certificates: generate BS 5839 / BS 5266 certificate PDFs
- Multi-engineer jobs: two engineers on one job, individual signatures

---

## Technical Debt to Address Before v2

- Replace polling in `syncEngine` (5 s interval) with Dexie `liveQuery` for instant queue updates
- Migrate Tailwind from v4 alpha to stable v4 release when available
- Add Playwright mobile-emulation e2e tests for the full engineer flow
- Add error boundaries around each page so one crash doesn't take down the app
- Consider service worker background sync for reliable upload when app is backgrounded
