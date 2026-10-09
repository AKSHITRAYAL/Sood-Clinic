# 04 — Backlog (phased, with dependencies and acceptance criteria)

How to use: pick the lowest-numbered unblocked task, do it, tick the box, fix any doc that changed. One task = one PR. Finding IDs refer to `02-audit-findings.md`; design references (`03 §n`) refer to `03-target-architecture.md`.

**Definition of Done (every task)**
- [ ] `npm run lint` and `npm run build` pass (Frontend); `functions` lint/tests pass.
- [ ] New/changed rules have emulator tests (positive and negative).
- [ ] New queries have indexes in `firestore.indexes.json`.
- [ ] No new PHI in logs; no secrets committed.
- [ ] Every loading/empty/error/success state of any touched screen is handled (see `06` §3).
- [ ] Docs updated if behaviour or schema changed; checkbox ticked here.
- [ ] Manual checks that need the live console/devices are listed in the PR.

**Tracks:** logic/backend tasks below come first. The UI/UX redesign is **Track U** (`06-ui-ux-handoff.md`); it starts once Phase 0 and the data layer of Phase 1 exist, and must not change data contracts.

**Suggested order inside Phase 0:** P0-08 → P0-00 → P0-05 → P0-01 → P0-07 → P0-06 → P0-04 → P0-02 → P0-03 → P0-09 → P0-10.

---

## Phase 0 — Stabilise and secure (before any real patient data)

- [x] **P0-08 Fix clean install** — *fixes BUG-08; completed 2026-10-02*
  - Upgraded `@vitejs/plugin-react` to `^6.1.1` and regenerated `package-lock.json`.
  - **Verified:** a clean install, build and lint succeed with no flags; README now uses plain `npm ci`.

- [x] **P0-00 Test harness and emulators** — *completed 2026-10-02; verified locally*; depends on P0-08
  - Added emulator configuration, root Vitest/rules-unit-testing tooling and a deny-by-default Firestore rules test.
  - **Verified:** `npm run test:rules` passed on a normal development machine. CI, Storage rules and deeper function tests remain future work.

- [x] **P0-05 IST/time module and date fixes** — *fixes BUG-05, BUG-10; completed 2026-10-02*; depends on P0-08
  - Added matching `Frontend/src/lib/ist.js` and `functions/lib/ist.js`: `toIstParts`, `istDateKey`, `istInstant`, `startOfIstWeekMonday`, `weekdayIst`, plus `addIstDays`.
  - Replaced business use of local weekday/hour and ISO date slicing. `npm run test:time` verifies fixed 00:30 IST boundary cases and is independent of host timezone.
  - **Verified:** the Doctor calendar week starts Monday and uses IST for navigation, appointment grouping, weekday status and display; booking and admin defaults use IST instants/date keys.

- [x] **P0-01 Fix schedule/exception storage shape** — *completed 2026-10-02; verified locally*; depends on P0-00, P0-05
  - New `doctorSchedules` and `scheduleExceptions` writes use session objects; readers accept legacy `clinicSchedules`/`availabilityOverrides` values while data is migrated. Rules validate session shape and actor scope.
  - `npm run test:schedule` verifies legacy conversion and new object serialization; emulator checks were completed locally.

- [ ] **P0-07 Project hygiene: plan, runtime, region, backups, staging** — *fixes BUG-16, SEC-11* (console + config)
  - Move project to Blaze with budget alerts; confirm Firestore location (India preferred; record it in `01`); enable PITR and scheduled backups; set Functions runtime to `nodejs22` (or 24) after checking Google's runtime-support page; create `sood-clinic-staging` project and `.firebaserc` alias.
  - **Accept:** checklist in the PR with console screenshots/values; `firebase deploy --only functions --project staging` works.

- [ ] **P0-06 Deploy pipeline, indexes, headers, listener errors** — *implementation complete; deploy verification pending; fixes BUG-06, BUG-07, SEC-06*; depends on P0-00
  - Added appointment indexes, hosting CSP/security headers, patient listener error handling, and a coordinated-release README command.
  - **Pending:** deploy rules/indexes/hosting, check live response headers and confirm a fresh Doctor calendar receives its composite index; do not tick until then.

- [ ] **P0-04 Rules hardening + App Check + tests** — *fixes SEC-01/02/04/12 (with P0-02)*; depends on P0-00
  - Implement `03 §5.1`: no client writes to `appointments`, `appointmentSlots`, `auditLogs`, `notifications`, `counters`; reception cannot read `medicalHistory/visits/documents`; `patients` field allow-list; schedule shape validation.
  - Enable App Check (reCAPTCHA Enterprise or v3) in the web app and enforce on Firestore and Functions; restrict the browser API key by referrer (console step, document it).
  - **Accept:** full permission-matrix test suite (`03 §3`) green; a scripted anonymous write to `appointments` is denied; a receptionist read of `patients/*/medicalHistory` is denied.

- [ ] **P0-02 Server-side booking (`getAvailability`, `createBooking`) and new slot model** — *fixes BUG-02, BUG-04, BUG-19, SEC-01*; depends on P0-05, P0-01, P0-04
  - Implement `03 §4.3`, `§6`, `§7` (availability engine as a pure, unit-tested module). Public booking page switches to the callable; remove direct Firestore writes; success screen shows the server `reference`.
  - Per-phone cap and IP throttle; `SLOT_TAKEN` etc. reasons mapped to friendly copy.
  - **Accept:** function tests: normal booking; double-book race (two parallel calls → one success, one `SLOT_TAKEN`); past time, closed day, outside window, invalid phone, missing consent rejected; book → cancel → rebook works; no client can write appointment/slot docs.

- [ ] **P0-03 Appointment state machine and `transitionAppointment`** — *fixes BUG-03, SEC-03*; depends on P0-02
  - Implement `03 §4.1–4.2` in `functions/lib/stateMachine.js` and a mirrored `allowedTransitions(status, role)` in the frontend (shared test vectors). Events subcollection. Doctor/Reception/Admin screens call the callable and render legal actions only. Fix counts (exclude cancelled).
  - Add `cancelAppointment` and `rescheduleAppointment`.
  - **Accept:** transition table test (every legal/illegal pair per role); check-in → in_consultation → completed flow works end-to-end; cancel requires a reason and frees the slot; `no_show` only after start+grace.

- [ ] **P0-09 Remove dead code** — *fixes BUG-04, SEC-10, ENG-06*; depends on P0-02
  - Delete `clinicApi`, Express/CORS deps, unused seed data paths that the new model does not use (keep a **new** seed for `clinic/*`, `doctors`, `doctorSchedules`), `.env.example` proxy text, dead CSS blocks (`01` §7), unused Tailwind colours.
  - **Accept:** build size decreases; no references to removed symbols; README updated.

- [ ] **P0-10 Basics that would embarrass in production** — *fixes BUG-09, UX-04 (contact), UX-03 (dev text)*
  - Consistent redirects (`/staff/*` → `/staff/login`); replace developer-facing error strings with human copy (log details); add clinic phone/WhatsApp/email to Footer, Contact, and booking success (values from `clinic/profile`, placeholders until the client supplies them); a real 404 page; `/book` route with `/Booknow` redirect.
  - **Accept:** no UI string mentions roles/Blaze/console; every public page shows a way to phone the clinic.

**Phase 0 exit:** all P0 boxes ticked; permission matrix tests green; staging mirrors production config; nothing in the browser can write appointments/slots directly.

---

## Phase 1 — Core clinic operations

- [ ] **P1-CONFIG Replace constants with config** — *fixes ENG-03*; depends on P0-02
  - Remove `DOCTOR_ID`/`BRANCH_ID`/`DEPARTMENT_ID` constants from UI/rules/functions; load from `doctors`, `clinic/publicConfig`, `clinic/profile`; `isDoctorOf(doctorId)` in rules.
  - **Accept:** adding a second doctor document + claim makes them bookable and scoped correctly (emulator test), no code change.

- [ ] **P1-REG Patient registry** — depends on P0-04, P1-CONFIG
  - `registerPatient`, UHID counter, dedupe rules (`03 §5`), staff search (phone exact / `nameLower` prefix), patient detail page skeleton (demographics + appointment history), patient claim/link flow.
  - **Accept:** create patient at reception, find by phone and name prefix, duplicates flagged, UHID sequential under parallel creates.

- [ ] **P1-BOOK Booking v2** — *fixes UX-01, BUG-13*; depends on P0-02, P1-REG
  - Steps: choose date/time → your details (name, phone with validation, sex, age/DOB, email optional, new/follow-up, reason) → review + consent (versioned text) → success page with reference, add-to-calendar, cancel/reschedule link. Live/refreshable availability from `getAvailability`; skeleton while loading; explicit "slot just taken" recovery that keeps entered details.
  - **Accept:** e2e happy path and race path; works signed-out and signed-in (links to patient).

- [ ] **P1-AVAIL Availability management v2** — *fixes BUG-11, BUG-12*; depends on P0-01, P0-03
  - Exception types `closed | extra | replace` with clear labels; multiple sessions per day; list/edit/delete upcoming exceptions; `closeDay` preview/apply with reschedule-or-cancel of affected appointments; leave/holiday calendar; slot length per doctor/visit type.
  - **Accept:** closing a day with 3 bookings shows them, forces a decision, and sends notifications; copy matches behaviour.

- [ ] **P1-RECEPTION Reception workspace v2** — *fixes BUG-14, UX-03*; depends on P0-03, P1-REG
  - Today-first view (bounded by `dateKey`), waiting list/queue with tokens, walk-in registration + `createStaffAppointment`, book-on-behalf with correct `source`, search, printable day sheet, quick actions by legal transitions, cancel with reason.
  - **Accept:** a receptionist can run a clinic day without leaving the page; read counts stay bounded (verify listener queries).

- [ ] **P1-DOCTOR Doctor workspace v2** — depends on P0-03, P1-REG
  - Today's patient list in queue order, "call next / start / complete", patient summary panel (demographics, past visits list), calendar for week planning (fix week logic), exceptions via P1-AVAIL.
  - **Accept:** doctor completes a day's list using only legal transitions; no cancelled items in counts.

- [ ] **P1-PATIENT Patient portal v2** — *fixes BUG-15, SEC-08, UX-02*; depends on P1-REG, P0-03
  - Link account to registry patient(s); upcoming/past appointments with cancel/reschedule (cutoff rule); "patient-reported information" (clearly labelled); clinic-issued content placeholders (visit summary/prescriptions arrive in P2); profile edit with allow-listed fields; email verification required.
  - **Accept:** a patient sees only their linked patients' data (rules tests), cancel after cutoff is refused with a clear message.

- [ ] **P1-NOTIFY Notifications** — depends on P0-02, D-03 decision
  - Outbox + `processNotification` + provider adapter; confirmation on booking; reminders (`sendReminders`); clinic-cancel/reschedule messages; opt-out; templates in `functions/templates/`.
  - **Accept:** on staging a booking creates exactly one confirmation; reminder job is idempotent; failures retry with backoff and are visible to admin.

- [ ] **P1-STAFFSEC Staff account security** — *fixes BUG-18, SEC-05*; depends on P0-04
  - `invite` flow; refuse `provision` on existing staff; `revokeRefreshTokens` on disable/role change; last-admin and self-lockout guards; password policy (≥ 12 or passphrase) for all users; staff MFA (Firebase Auth multi-factor, TOTP/SMS as available) enforced for admin/doctor; idle-timeout on staff site.
  - **Accept:** function tests for each guard; a disabled user's session stops working within minutes.

- [ ] **P1-AUDIT Audit log** — *fixes SEC-03*; depends on P0-03
  - `auditLogs` writes from all mutating functions (PHI-free metadata); admin viewer with filters.
  - **Accept:** every transition/registration/staff action produces one entry; clients cannot write or read them unless admin.

- [ ] **P1-LEGAL Privacy, terms, consent, analytics consent** — *fixes SEC-07, SEC-13*
  - Privacy policy, terms, cookie/analytics consent banner (public site only); `consent:{version, acceptedAt}` stored; contact for data requests. Content reviewed by the client/lawyer (`05`).
  - **Accept:** analytics does not load before consent; not loaded on staff/patient areas.

- [ ] **P1-CONTENT Public site content** — *fixes UX-04*
  - Real contact details, hours rendered from schedule config (single source), services/conditions, fees (if the client agrees), FAQs, what-to-bring, emergency notice, real photos (from the client), remove or clearly qualify the "video visits" claim until built.
  - **Accept:** no hard-coded hours anywhere except as rendered from config.

- [ ] **P1-SPLIT Two-site build and lazy loading** — *fixes PERF-01*; `03 §2`
  - Two Vite entry points + two Hosting targets + custom domains; `/staff*` on public site redirects to the staff domain; per-site headers/robots; route-level `lazy()` inside each app.
  - **Accept:** public bundle contains no staff code; both sites deploy independently from one command; sessions do not cross origins.

- [ ] **P1-PERF Startup fixes** — *fixes BUG-17*
  - Render React without awaiting `setPersistence`; move analytics init after consent.

- [ ] **P1-CI CI/CD and environments** — *fixes BUG-07, ENG-04*; depends on P0-00, P0-07
  - GitHub Actions: install (`npm ci`), lint, build both sites, rules tests, function tests, on PR; deploy to staging on merge to `main`; manual approval for production; least-privilege service account via OIDC (no long-lived token in secrets if possible). See `08` §5.

---

## Phase 2 — Clinic depth

- [ ] **P2-CLINICAL Consultation record and prescriptions** — *SEC-08*; depends on P1-DOCTOR
  - `visits` (complaints, history, examination, vitals, diagnosis, advice, follow-up), autosave drafts, `finalizeVisit` lock, addenda instead of edits after lock; prescriptions with drug list templates; **printable prescription PDF on letterhead** (client-side print stylesheet first); follow-up date creates a reminder; patient sees only `publishedToPatient` summaries.
- [ ] **P2-FILES Documents and reports** — Storage rules per `03 §9`; upload from reception/patient/doctor; category, visibility flag; download via signed URLs; size/type limits.
- [ ] **P2-BILLING Billing and payments** — fee schedule (config), invoice numbers per financial year, receipt PDF, cash/UPI/card, optional online payment (D-05), daily collection report and day-close.
- [ ] **P2-REPORTS Admin reports and settings** — visits per day/month, no-show rate, cancellations, revenue, busiest slots; settings screen for `clinic/settings` and `clinic/profile`.
- [ ] **P2-GASTRO Gastroenterology workflow** (client-specific, D-08) — procedure scheduling (endoscopy/colonoscopy) with longer slots and prep instructions, procedure consent forms, pathology/biopsy result tracking, follow-up recalls.
- [ ] **P2-VIDEO Video consultation** — only if the client confirms (D-04); India telemedicine guidelines apply; otherwise remove the claim (P1-CONTENT).
- [ ] **P2-RIGHTS Patient data rights** — export and deletion/anonymisation workflow (`05` §4).
- [ ] **P2-MERGE Duplicate patient merge** with audit and `mergedInto`.

---

## Phase 3 — Launch readiness

- [ ] **P3-SEO** — prerender/static-generate public pages, unique titles/descriptions, Open Graph, JSON-LD `MedicalClinic`/`Physician`, `sitemap.xml`, `robots.txt`, canonical, Google Business Profile linked; `noindex` for patient/staff/login. *Fixes SEO-01.*
- [ ] **P3-PERF** — self-host fonts (`font-display: swap`), responsive WebP/AVIF images with `srcset`, self-hosted favicon set, lazy images; Lighthouse targets ≥ 90 mobile on public pages. *Fixes PERF-02.*
- [ ] **P3-A11Y** — pass WCAG 2.2 AA on public and staff: carousel pause/remove, focus management, `aria-pressed`/`aria-describedby`, `:focus-visible`, contrast, reduced motion, keyboard-only booking. *Fixes A11Y-01.* (Design-side items are in `06` §6.)
- [ ] **P3-E2E** — Playwright e2e against emulators: booking, cancel, reception day, doctor flow, patient portal.
- [ ] **P3-DOMAIN** — custom domains (public + staff), DNS, email deliverability (SPF/DKIM/DMARC), Auth authorized domains, App Check site keys for the domains.
- [ ] **P3-MONITORING** — error-rate and latency alerts, uptime checks, budget alerts, log-based metrics without PHI.
- [ ] **P3-I18N** (if D-09) — Hindi (and/or Punjabi) UI strings for public site and booking.
- [ ] **P3-HANDOVER** — runbook (deploy, rollback, restore drill from backup, rotate keys, add staff), staff training, admin guide, maintenance agreement, known-limitations list.

## Track U — UI/UX (starts after Phase 0 + the P1 data layer)

See `06-ui-ux-handoff.md`. Deliverables: design tokens and component library (`src/ui`), redesigned public site and booking, patient portal, three staff workspaces, states/empty/error handling, accessibility and responsive behaviour. Rule: **UI work may change markup, styles and component structure; it may not change data shapes, rules, Function contracts or state-machine logic.**
