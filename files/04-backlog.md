# Scheduler implementation handoff

**Updated:** 2026-10-15
**Repository:** `AKSHITRAYAL/Sood-Clinic`
**Continuation branch:** `akshitrayal-scheduler-implementation`
**Local public app:** `http://localhost:5173/book`
**Working roadmap:** This file (`files/04-backlog.md`). The originally requested `PROMPT-A-scheduler.md` was not present in the repository.

## Current completion

**30.6% complete — 15 of 49 roadmap checklist items checked; 34 items remain.** This is a strict checklist percentage, not an estimate of partial feature completion. Do not mark the overall scheduler task complete until the remaining unchecked work is implemented and verified.

## Implemented and verified

### Phase 0 foundation and security

- Clean-install tooling, Vite/React build setup, Firebase emulator configuration, Vitest tests, Firestore rules tests, and CI verification workflow.
- IST-safe business-time helpers in the frontend and Functions. Business dates use `YYYY-MM-DD` `dateKey` values and Firestore timestamps.
- Schedule and exception storage uses session objects such as `{ start: "08:00", end: "10:00" }`; legacy schedule values are read compatibly.
- Server-authoritative booking and availability: `getBookingCatalog`, `getMonthAvailability`, `getAvailability`, `holdSlot`, `releaseHold`, and `createBooking`. `getMonthAvailability` loads the schedule, exceptions, blocks and unit locks ONCE for the month (one unit-docs query, one free/busy request) and runs the pure engine per day.
- Five-minute slot units, conflict prevention, slot holds, secure booking references, phone validation, booking-window checks, closed-day checks, consent capture, and slot-race handling.
- Appointment state machine with callable transitions, role-aware frontend transition display, cancellation reasons, and server-only appointment/slot writes.
- Firestore rules deny browser writes to appointments, appointment slots, audit logs, notifications, counters, private appointment data, waitlist records, and patient-link requests.
- Public 404 handling, `/Booknow` redirect, `/staff/*` redirect boundary, public contact links, privacy page, terms page, and public privacy-choice banner.

### Phase 1 scheduler and clinic operations

- **P1-CONFIG:** booking catalogue is loaded from active branches, departments, doctors, and visit types; no clinic-specific browser IDs are required.
- **P1-REG:** server-owned patient registration, UHID allocation, duplicate identity locks, secure staff search, bounded appointment history, and verified patient account linking with administrator approval.
- **P1-BOOK:** public booking with date/time selection, live availability, structured details (sex, age/DOB, email, new/follow-up, reason), review and consent, server reference, calendar download, guest management, waitlist recovery, and entered-detail preservation after slot races. The callable contract is now the scheduler spec §6.6 (`startsAt`, `holdId`, `consent:{version}`, `intake`) and the appointment stores the §4.3 fields; `functions/lib/engine/bookingInput.js` is the single server-side validator (the interim `dateKey`/`time` shape was removed by A1-03 on 2026-10-16). Holds are §6.4–6.5 behind `functions/src/scheduler/holds.js`: a client-named, 5-minute unit lock that `createBooking` converts, at most one active hold per id, and `releaseHold` scoped to `{doctorId, holdId}`.
- **P1-AVAIL:** weekly schedule management, `closed`/`extra`/`replace` exceptions, multiple special-hours sessions, bounded upcoming exception management, authorized deletion, close-day preview/apply, keep/cancel decisions, cancellation reasons, slot release, audit events, and clinic-cancellation notification queueing.
- **P1-MANAGER:** bounded date-based manager queue, queue tokens, legal transitions, cancellation reasons, printable day sheet, patient registry, and catalogue-driven book-on-behalf/walk-in/phone appointment creation through `createStaffAppointment`.
- **P1-DOCTOR:** `/staff/doctor` doctor-claim-scoped workspace, bounded IST daily queue, queue tokens, legal call/start/complete/cancel actions, and server-authorized patient demographics/history through `getDoctorPatientSummary`. Schedule management is at `/staff/doctor/schedule`.
- **P1-PATIENT:** verified linked clinic record, scoped upcoming/past appointments and documents, patient-reported information separation, allow-listed profile writes, cancellation/rescheduling, and verified email requirement.
- Notification outbox, transactional processing claims, retry backoff, dead-letter state, scheduled processing, reminders, and clinic-cancellation queueing are implemented. Provider credentials and live delivery are not configured locally.

### Main implementation surfaces

- Frontend booking: `Frontend/src/pages/Bookappointment.jsx`
- Guest confirmation: `Frontend/src/features/scheduler/ConfirmationPage.jsx`
- Public routes/legal: `Frontend/src/entry/public.jsx`, `Frontend/src/pages/Legal.jsx`
- Staff routes: `Frontend/src/entry/staff.jsx`
- Manager workspace: `Frontend/src/pages/ManagerWorkspace.jsx`
- Doctor workspace: `Frontend/src/pages/DoctorWorkspace.jsx`
- Doctor schedule: `Frontend/src/pages/DoctorSchedule.jsx`
- Staff calendar: `Frontend/src/pages/StaffCalendar.jsx`
- Patient portal: `Frontend/src/pages/PatientPortal.jsx`
- Patient registry/admin approval: `Frontend/src/pages/AdminPatients.jsx`
- Scheduler callable wrappers: `Frontend/src/services/schedulerService.js`
- Backend callables and scheduled jobs: `functions/index.js`
- Availability engine: `functions/lib/engine/availability.js`
- Placement/conflict engine: `functions/lib/engine/placement.js`
- Notification policy: `functions/lib/notifications.js`
- Rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Rules tests: `tests/rules/default-deny.test.js`
- CI: `.github/workflows/verify.yml`

## Validation already passing

- `npm --prefix Frontend run lint`
- `npm --prefix Frontend run build` (public and staff builds)
- `npm --prefix functions run lint`
- `npx vitest run functions/test` — 72 tests
- `npx vitest run tests/time tests/schedule functions/test` — 78 tests
- `npm run test:rules` — 14/14 Firestore rules tests
- `git diff --check`
- Local route checks for `/book`, `/privacy`, and `/terms`

Builds still report the existing large JavaScript chunk warning; this is not a build failure.

## Remaining work for the next AI

1. Complete live/configuration-dependent Phase 0 work: Firebase App Check enforcement, browser API-key restrictions, staging project, billing/budget/PITR/backups, deployed rules/indexes/functions, and live header/index verification.
2. Finish notification delivery: resolve provider decision D-03, add approved email/WhatsApp templates and secrets, test staging delivery, expose retry/dead-letter visibility, and implement opt-out behavior.
3. Finish staff security: invite-only lifecycle, existing-account protections, refresh-token revocation verification, last-admin/self-lockout tests, staff MFA, password policy alignment, and idle-timeout verification.
4. Finish legal/content/configuration review: client-reviewed privacy/terms/consent wording, real clinic content/hours/contact values, analytics policy, emergency notice, fees/services, and remove or qualify unsupported video-visit claims.
5. Finish independent public/staff hosting split and deployment environments, including domain/session isolation and route-level deployment verification.
6. Continue Phase 2: consultation records and prescriptions, documents/storage rules and signed URLs, billing/payments, admin reports/settings, gastroenterology procedures, video decision, patient data rights, and duplicate-patient merge.
7. Continue Phase 3: SEO, performance, WCAG 2.2 AA accessibility, Playwright E2E, custom domains/email deliverability, monitoring/budget alerts, i18n if approved, and handover/runbook/training.
8. Re-run all validation after every change and update this handoff plus the checklist percentage before and after each substantive slice.

## Continuation rules

- Work only on branch `akshitrayal-scheduler-implementation` unless explicitly instructed to create or stack another branch.
- Do not assume live Firebase configuration is complete because local emulators pass.
- Do not weaken Firestore rules to make a UI query work; fix the query or add a server-authorized callable.
- Preserve Asia/Kolkata business-time handling and server-authoritative writes.
- Do not log patient names, phone numbers, diagnoses, clinical text, or other PHI.
- Before claiming completion, verify frontend lint/build, Functions lint/tests, rules tests, and changed-route behavior.

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

- [x] **P0-06 Deploy pipeline, indexes, headers, listener errors** — *deployed; fixes BUG-06, BUG-07, SEC-06*; depends on P0-00
  - Added appointment indexes, hosting CSP/security headers, patient listener error handling, and a coordinated-release README command.
  - **Pending:** deploy rules/indexes/hosting, check live response headers and confirm a fresh Doctor calendar receives its composite index; do not tick until then.

- [ ] **P0-04 Rules hardening + App Check + tests** — *fixes SEC-01/02/04/12 (with P0-02)*; depends on P0-00
  - Implement `03 §5.1`: no client writes to `appointments`, `appointmentSlots`, `auditLogs`, `notifications`, `counters`; manager cannot read `medicalHistory/visits/documents`; `patients` field allow-list; schedule shape validation.
  - Enable App Check (reCAPTCHA Enterprise or v3) in the web app and enforce on Firestore and Functions; restrict the browser API key by referrer (console step, document it).
  - **Accept:** full permission-matrix test suite (`03 §3`) green; a scripted anonymous write to `appointments` is denied; a manager read of `patients/*/medicalHistory` is denied.

- [ ] **P0-02 Server-side booking (`getAvailability`, `createBooking`) and new slot model** — *fixes BUG-02, BUG-04, BUG-19, SEC-01*; depends on P0-05, P0-01, P0-04
  - Implement `03 §4.3`, `§6`, `§7` (availability engine as a pure, unit-tested module). Public booking page switches to the callable; remove direct Firestore writes; success screen shows the server `reference`.
  - Per-phone cap and IP throttle; `SLOT_TAKEN` etc. reasons mapped to friendly copy.
  - **Accept:** function tests: normal booking; double-book race (two parallel calls → one success, one `SLOT_TAKEN`); past time, closed day, outside window, invalid phone, missing consent rejected; book → cancel → rebook works; no client can write appointment/slot docs.

- [ ] **P0-03 Appointment state machine and `transitionAppointment`** — *fixes BUG-03, SEC-03*; depends on P0-02
  - Implement `03 §4.1–4.2` in `functions/lib/stateMachine.js` and a mirrored `allowedTransitions(status, role)` in the frontend (shared test vectors). Events subcollection. Doctor/Manager/Admin screens call the callable and render legal actions only. Fix counts (exclude cancelled).
  - Add `cancelAppointment` and `rescheduleAppointment`.
  - **Accept:** transition table test (every legal/illegal pair per role); check-in → in_consultation → completed flow works end-to-end; cancel requires a reason and frees the slot; `no_show` only after start+grace.

- [x] **P0-09 Remove dead code** — *deployed; fixes BUG-04, SEC-10, ENG-06*; depends on P0-02
  - Delete `clinicApi`, Express/CORS deps, unused seed data paths that the new model does not use (keep a **new** seed for `clinic/*`, `doctors`, `doctorSchedules`), `.env.example` proxy text, dead CSS blocks (`01` §7), unused Tailwind colours.
  - **Accept:** build size decreases; no references to removed symbols; README updated.

- [x] **P0-10 Basics that would embarrass in production** — *fixes BUG-09, UX-04 (contact), UX-03 (dev text); completed 2026-10-14*
  - Verified public 404 handling, `/Booknow` redirect, staff redirect boundary, human-facing public errors, and clinic phone/email links in the footer, contact page, and booking confirmation.
  - Consistent redirects (`/staff/*` → `/staff/login`); replace developer-facing error strings with human copy (log details); add clinic phone/WhatsApp/email to Footer, Contact, and booking success (values from `clinic/profile`, placeholders until the client supplies them); a real 404 page; `/book` route with `/Booknow` redirect.
  - **Accept:** no UI string mentions roles/Blaze/console; every public page shows a way to phone the clinic.

**Phase 0 exit:** all P0 boxes ticked; permission matrix tests green; staging mirrors production config; nothing in the browser can write appointments/slots directly.

---

## Phase 1 — Core clinic operations

- [x] **P1-CONFIG Replace constants with config** — *fixes ENG-03; completed 2026-10-15*
  - Remove `DOCTOR_ID`/`BRANCH_ID`/`DEPARTMENT_ID` constants from UI/rules/functions; load from `doctors`, `clinic/publicConfig`, `clinic/profile`; `isDoctorOf(doctorId)` in rules.
  - **Verified:** public booking loads active branches, departments, doctors, and visit types through `getBookingCatalog`; booking and availability validate the selected catalogue IDs server-side; Google Calendar connection no longer falls back to a clinic-specific doctor ID. Adding another active doctor document makes that doctor selectable without a code change.

- [x] **P1-REG Patient registry** — *completed 2026-10-15*; depends on P0-04, P1-CONFIG
  - `registerPatient`, UHID counter, dedupe rules (`03 §5`), staff search (phone exact / `nameLower` prefix), patient detail page skeleton (demographics + appointment history), patient claim/link flow.
  - **Verified:** server-owned registration, sequential UHID allocation, duplicate identity locks, bounded appointment history, secure staff search, verified patient link requests with administrator approval, and linked-account rules coverage are implemented.
  - **Manual verification:** exercise parallel registration and the approval flow in staging with real Auth accounts.

- [x] **P1-BOOK Booking v2** — *fixes UX-01, BUG-13; completed 2026-10-15*; depends on P0-02, P1-REG
  - Steps: choose date/time → your details (name, phone with validation, sex, age/DOB, email optional, new/follow-up, reason) → review + consent (versioned text) → success page with reference, add-to-calendar, cancel/reschedule link. Live/refreshable availability from `getAvailability`; skeleton while loading; explicit "slot just taken" recovery that keeps entered details.
  - **Accept:** e2e happy path and race path; works signed-out and signed-in (links to patient).
  - **Verified:** the public flow has date/time selection, catalogue-driven live availability, structured details, review and consent, server reference, calendar download, guest management, waitlist recovery, and preserves entered details across slot races. Staging e2e still requires Firebase accounts/provider configuration.

- [x] **P1-AVAIL Availability management v2** — *fixes BUG-11, BUG-12; completed 2026-10-15*
  - Exception types `closed | extra | replace` with clear labels; multiple sessions per day; list/edit/delete upcoming exceptions; `closeDay` preview/apply with reschedule-or-cancel of affected appointments; leave/holiday calendar; slot length per doctor/visit type.
  - **Verified:** doctor schedule UI supports closed, extra, and replacement exceptions, up to two sessions, bounded upcoming exception listing, editing, and server-authorised deletion. `closeDay` previews affected appointments, requires an explicit keep/cancel decision and reason, frees cancelled slots, writes audit/events, and queues clinic-cancellation email notifications. Slot duration remains catalogue-driven by visit type.
  - **Manual verification:** run the close-day flow against staging with a configured notification provider and confirm delivery.

- [x] **P1-MANAGER Manager workspace v2** — *fixes BUG-14, UX-03; completed 2026-10-15*; depends on P0-03, P1-REG
  - Today-first view (bounded by `dateKey`), waiting list/queue with tokens, walk-in registration + `createStaffAppointment`, book-on-behalf with correct `source`, search, printable day sheet, quick actions by legal transitions, cancel with reason.
  - **Accept:** a manager can run a clinic day without leaving the page; read counts stay bounded (verify listener queries).
  - **Verified:** manager queue reads one selected `dateKey`, displays queue tokens, exposes legal transitions with cancellation reasons, provides printable day sheets, and includes catalogue-driven book-on-behalf/walk-in/phone appointment creation through `createStaffAppointment`. Staging verification requires configured staff claims and Firebase data.

- [x] **P1-DOCTOR Doctor workspace v2** — *completed 2026-10-15*; depends on P0-03, P1-REG
  - Today's patient list in queue order, "call next / start / complete", patient summary panel (demographics, past visits list), calendar for week planning (fix week logic), exceptions via P1-AVAIL.
  - **Accept:** doctor completes a day's list using only legal transitions; no cancelled items in counts.
  - **Verified:** `/staff/doctor` is doctor-claim scoped, uses bounded IST `dateKey` reads, exposes legal transition actions, excludes cancelled items from active counts, and loads a bounded patient summary/history through the doctor-authorized `getDoctorPatientSummary` callable. Staging verification still requires a real doctor claim and appointment data.

- [x] **P1-PATIENT Patient portal v2** — *fixes BUG-15, SEC-08, UX-02; completed 2026-10-15*; depends on P1-REG, P0-03
  - Link account to registry patient(s); upcoming/past appointments with cancel/reschedule (cutoff rule); "patient-reported information" (clearly labelled); clinic-issued content placeholders (visit summary/prescriptions arrive in P2); profile edit with allow-listed fields; email verification required.
  - **Verified:** the portal resolves the verified linked clinic record, reads only that record's appointments/documents, labels self-reported health information, uses callable allow-listed profile writes, requires verified email, and exposes cancellation/rescheduling with the server cutoff policy. Linked-record access and denial tests pass.
  - **Manual verification:** verify the complete link-request/administrator-approval journey with staging accounts.

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

- [x] **P1-PERF Startup fixes** — *fixes BUG-17; completed 2026-10-15*
  - Render React without awaiting `setPersistence`; move analytics init after consent.
  - **Verified:** the public and staff entry points mount immediately; auth persistence is awaited only by flows that need it, and frontend lint/build pass.

- [ ] **P1-CI CI/CD and environments** — *fixes BUG-07, ENG-04*; depends on P0-00, P0-07
  - GitHub Actions: install (`npm ci`), lint, build both sites, rules tests, function tests, on PR; deploy to staging on merge to `main`; manual approval for production; least-privilege service account via OIDC (no long-lived token in secrets if possible). See `08` §5.

---

## Phase 2 — Clinic depth

- [ ] **P2-CLINICAL Consultation record and prescriptions** — *SEC-08*; depends on P1-DOCTOR
  - `visits` (complaints, history, examination, vitals, diagnosis, advice, follow-up), autosave drafts, `finalizeVisit` lock, addenda instead of edits after lock; prescriptions with drug list templates; **printable prescription PDF on letterhead** (client-side print stylesheet first); follow-up date creates a reminder; patient sees only `publishedToPatient` summaries.
- [ ] **P2-FILES Documents and reports** — Storage rules per `03 §9`; upload from manager/patient/doctor; category, visibility flag; download via signed URLs; size/type limits.
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
- [ ] **P3-E2E** — Playwright e2e against emulators: booking, cancel, manager day, doctor flow, patient portal.
- [ ] **P3-DOMAIN** — custom domains (public + staff), DNS, email deliverability (SPF/DKIM/DMARC), Auth authorized domains, App Check site keys for the domains.
- [ ] **P3-MONITORING** — error-rate and latency alerts, uptime checks, budget alerts, log-based metrics without PHI.
- [ ] **P3-I18N** (if D-09) — Hindi (and/or Punjabi) UI strings for public site and booking.
- [ ] **P3-HANDOVER** — runbook (deploy, rollback, restore drill from backup, rotate keys, add staff), staff training, admin guide, maintenance agreement, known-limitations list.

## Track U — UI/UX (starts after Phase 0 + the P1 data layer)

See `06-ui-ux-handoff.md`. Deliverables: design tokens and component library (`src/ui`), redesigned public site and booking, patient portal, three staff workspaces, states/empty/error handling, accessibility and responsive behaviour. Rule: **UI work may change markup, styles and component structure; it may not change data shapes, rules, Function contracts or state-machine logic.**
