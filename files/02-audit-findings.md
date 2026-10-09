# 02 — Audit Findings (issue register)

Baseline: commit `76477ff`, 2026-09-30. Facts about the current code are in `01-current-state.md`. The target design that fixes these is in `03-target-architecture.md`; tasks are in `04-backlog.md` (each finding lists the task that resolves it).

**Severity**
- **P0** — breaks real use or exposes patients/clinic. Fix before any real patient touches the system.
- **P1** — must be fixed before public launch.
- **P2** — should be fixed for a production-quality product.
- **P3** — polish.

**Confidence**
- **Confirmed** — read directly in code or reproduced (build/lint).
- **Likely** — follows from documented platform behaviour; verify with one quick test.
- **Verify** — depends on something not visible in the repo (console settings, deployed state).

---

## A. Bugs and wrong logic

### BUG-01 [P0] Weekly hours and date exceptions cannot be saved (nested arrays) — Likely
- **Where:** `DoctorSchedule.jsx` (`saveWeekly`, `saveException`), `StaffAdmin.jsx` (`saveOverride`), read in `Bookappointment.jsx`. Stored as `windows: [["08:00","10:00"],["17:00","18:30"]]`.
- **Problem:** Firestore rejects arrays directly inside arrays ("Nested arrays are not supported"). The UI swallows the error and shows "Unable to save…". The doctor therefore cannot change hours or close a day.
- **Fix:** store `windows: [{ start, end }]`. Readers accept both shapes during migration. Update rules to validate the shape (see `03` §5).
- **Accept:** in the emulator, saving weekly hours and a date exception succeeds and the public booking page reflects them.
- **Task:** P0-01.

### BUG-02 [P0] A cancelled slot can never be re-booked — Confirmed
- **Where:** `Bookappointment.jsx` writes `appointments/{slotId}` and `appointmentSlots/{slotId}` using the same deterministic id; cancel flows keep the appointment (status `cancelled`) because `delete` is denied.
- **Problem:** the next booking does `batch.set` on an existing appointment doc = an *update*, which rules allow only for clinic staff, so the batch fails. The UI then wrongly reports "no longer available" and marks the slot Booked locally. Every cancellation permanently burns that time.
- **Fix:** auto-generated appointment ids; slot doc is a separate lock (created/deleted by server in one transaction). See `03` §4/§6.
- **Accept:** book → cancel → book same slot succeeds; concurrent double-book yields exactly one success.
- **Task:** P0-02.

### BUG-03 [P0] Appointment status workflow dead-ends — Confirmed
- **Where:** `ReceptionWorkspace.jsx` sets `confirmed` / `checked-in`; `DoctorSchedule.jsx` and `StaffAdmin.jsx` only show Complete/Cancel when `status === 'scheduled'`.
- **Problems:** after check-in nobody can complete the visit; no `no_show` or `in_consultation`; admin filter/metrics ignore confirmed/checked-in; doctor's "N scheduled" and week grid count cancelled appointments; status strings use a hyphen (`checked-in`) inconsistent with a normal enum.
- **Fix:** single state machine (`03` §4) enforced by the `transitionAppointment` callable; shared `<StatusBadge>`/actions driven by allowed-transition data.
- **Accept:** every state in the table is reachable and every UI shows only legal actions for the viewer's role; counts exclude cancelled.
- **Task:** P0-03.

### BUG-04 [P1] Two incompatible booking implementations — Confirmed
- **Where:** browser batch write vs `functions/index.js → clinicApi` (`POST /api/v1/public/booking/appointments`).
- **Problem:** different ids, `Timestamp` vs ISO strings, doctor schedule read from `doctors.weeklySchedule` (never maintained by the UI), server-local `getDay()` (UTC). Not routed by Hosting; unused. Dangerous if someone switches to it.
- **Fix:** delete `clinicApi` and its CORS/express deps; implement `createBooking` callable per `03` §6.
- **Task:** P0-02, P0-09.

### BUG-05 [P1] Time-zone handling is wrong in several places — Confirmed
- Slot instants are built with `new Date("YYYY-MM-DDTHH:mm:00")` in the **browser's** zone: a patient abroad books the wrong instant.
- Past slots earlier today remain bookable (no "now" cutoff).
- `StaffAdmin` `dateKey()` uses `toISOString()` (UTC): between 00:00 and 05:30 IST it shows *yesterday*.
- Staff pages group appointments by `startsAt.slice(0,10)` (UTC date).
- Dead API uses server-local (UTC) weekday/hour.
- **Fix:** IST helper module (`Asia/Kolkata`, fixed +05:30), `dateKey` stored on appointments, server computes instants. **Task:** P0-05.

### BUG-06 [P1] Missing composite index; silent blank calendar — Confirmed
- **Where:** `DoctorSchedule.jsx` query `where doctorId == X orderBy startsAt` needs a composite index; `firestore.indexes.json` only has an index for the dead API. The `onSnapshot` has **no error callback**, so a missing index shows an empty calendar with no message.
- **Fix:** add indexes; error callbacks + visible error states on every listener. **Task:** P0-06.

### BUG-07 [P1] Deploy drift — Confirmed (deployed state: Verify)
- README deploy command is `--only hosting:sood-clinic`. Rules, indexes and functions are never shipped by it, so production can differ from the repo. **Task:** P0-06, P1-CI.

### BUG-08 [P0] Clean install fails — Resolved 2026-10-02
- Upgraded `@vitejs/plugin-react` to `^6.1.1`, which supports Vite 8, and regenerated `package-lock.json`.
- Plain `npm ci`, build and lint are now the required install and verification path. **Task:** P0-08 complete.

### BUG-09 [P2] Inconsistent redirects — Confirmed
- `StaffEntry` and `StaffAdmin` send signed-out users to `/login` (patient page); other staff pages go to `/staff/login`. **Task:** P0-10.

### BUG-10 [P1] "Current week" jumps forward on Sundays — Confirmed
- `startOfWeek()` does `date - getDay() + 1`; on Sunday `getDay()==0` so it returns the *next* Monday. **Fix:** Monday-based week using `(getDay()+6)%7`. **Task:** P0-05.

### BUG-11 [P1] Special-hours semantics contradict their own copy — Confirmed
- `override.status==='available'` **replaces** the day's regular hours (`override.windows || regular`), but the admin form says "Regular Monday–Saturday hours remain active. Use this only for closures, Sunday clinics, or overtime."
- Opening "extra" hours on a normal Monday silently removes the regular sessions.
- **Fix:** define two exception types: `closed` and `extra` (adds to regular) and optionally `replace`. Copy must match. **Task:** P1-AVAIL.

### BUG-12 [P1] Closing a day or editing hours ignores existing bookings — Confirmed
- Marking a date unavailable, or shrinking weekly hours, leaves already-booked patients silently orphaned. **Fix:** `closeDay` callable returns the affected appointments and requires staff to reschedule/cancel with reason (+ notification). **Task:** P1-AVAIL.

### BUG-13 [P2] Public availability = N+1 reads and a default-hours flash — Confirmed
- One `getDoc` per candidate slot per day change; initial render uses hard-coded `HOURS` until the schedule loads. **Fix:** one ranged query or a server `getAvailability`; show a skeleton until loaded. **Task:** P1-BOOK.

### BUG-14 [P2] Staff lists are unbounded — Confirmed
- Reception, Admin and Doctor subscribe to **all appointments ever** (`orderBy startsAt`, no range/limit). Cost and render time grow forever; Reception's copy says "Today's schedule" but shows everything. **Fix:** date-bounded queries via `dateKey`, pagination for history. **Task:** P1-RECEPTION.

### BUG-15 [P2] Patient portal small logic issues — Confirmed
- Appointment counter includes cancelled; bookings made while signed out are never linked to a later account; the booking form is not pre-filled from the profile. **Task:** P1-PATIENT.

### BUG-16 [P1] Functions runtime — Verify
- `functions/package.json` pins `engines.node: "20"`. Google's runtime-support page shows Node 22 deprecating 2027-04-30 and Node 24 (2nd gen) later; Node 20 is earlier and may already be deprecated/decommissioned. Check the page and move to `nodejs22` (or 24) before deploying. Also review `firebase-functions@^6` → current major. **Task:** P0-07.

### BUG-17 [P2] First render is blocked on auth persistence — Confirmed
- `main.jsx` awaits `authReady` (`setPersistence`) before mounting React → slower first paint. `browserLocalPersistence` is already the default on web; remove the await. **Task:** P1-PERF.

### BUG-18 [P1] `provision` overwrites existing accounts — Confirmed
- `manageStaffAccount` with `action:'provision'` on an existing user resets their password and replaces their claims (including another admin's). **Fix:** refuse if the user already has a staff claim unless `action:'role'`; email invite flow instead of typed passwords. **Task:** P1-STAFFSEC.

### BUG-19 [P2] Booking "reference" is meaningless — Confirmed
- Shows `id.slice(-10)` (e.g. `05_08-00`), not unique, not usable at reception. **Fix:** server-issued short reference (`SC-XXXXXX`). **Task:** P0-02.

---

## B. Security, privacy, compliance

### SEC-01 [P0] Unauthenticated writes with weak validation — Confirmed
- Anyone can create `appointments` and `appointmentSlots`. Rules check shape only: `startsAt` is "a string" (any date, any time, Sundays, 2030, the past); `slotId` is unrelated to `startsAt`; unlimited volume from bots floods reception and fills the calendar.
- **The slot lock is optional:** the `appointments` create rule does not require a matching slot doc to be created, so a client using a random appointment id and no slot doc bypasses the double-booking guard.
- **Fix:** no client writes to these collections; `createBooking` callable with validation, transaction, rate limits and App Check. **Task:** P0-02, P0-04.

### SEC-02 [P0] Receptionist can read medical history and documents — Confirmed
- `isClinicStaff()` (includes receptionist) grants read on `patients/*/medicalHistory` and `medicalDocuments`. **Fix:** doctor (and owning patient where allowed) only; reception gets a minimal demographics view. **Task:** P0-04.

### SEC-03 [P1] Staff can edit any appointment field; no audit trail — Confirmed
- Update rule only checks `doctorId`. `updatedBy` is set by the client. Slots updatable by any staff. **Fix:** status changes only via callable; server writes `events` subcollection and `auditLogs`. **Task:** P0-03, P1-AUDIT.

### SEC-04 [P1] App Check / API key restriction — Verify
- Nothing in the repo enables App Check; callable has `enforceAppCheck:false`. **Fix:** reCAPTCHA (Enterprise/v3) App Check enforced on Firestore, Auth (as available) and Functions; restrict the browser API key by HTTP referrer to the production domains. **Task:** P0-04.

### SEC-05 [P1] Account security is weak — Confirmed
- 6-character password minimum (UI and function); no email verification for patients; no MFA for staff; temporary passwords typed by admin and passed around; disabling a user does not revoke existing tokens (up to ~1 h); nothing prevents an admin disabling/demoting themselves or the last admin. **Task:** P1-STAFFSEC.

### SEC-06 [P1] No HTTP security headers — Confirmed
- `firebase.json` sends only cache headers. Add CSP, `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`; stricter set on the staff site. (Only the unused Express API sets a few.) **Task:** P0-06.

### SEC-07 [P1] Analytics + no privacy notice — Confirmed
- Firebase Analytics runs for every visitor on every route including patient/staff screens; no consent banner; no privacy policy or terms. **Fix:** disable on staff/patient areas, consent gate on public site, publish policies. **Task:** P1-LEGAL.

### SEC-08 [P1] Patient-authored "medical history" mixed with clinical authority — Confirmed (design)
- Patients create/edit/delete their own history and "document records"; staff read them as if authoritative. **Fix:** separate *patient-reported* info (clearly labelled) from *clinician-recorded* visits. **Task:** P1-PATIENT, P2-CLINICAL.

### SEC-09 [P2] Public repository — Confirmed
- Repo is public and contains a real client's details and the full security model. Not a direct vulnerability (rules are the control) but not appropriate for client work. Consider making it private. **Decision:** `07`.

### SEC-10 [P2] Dead public API surface — Confirmed
- `clinicApi` exposes public endpoints with no rate limiting/App Check. Remove. **Task:** P0-09.

### SEC-11 [P1] Backups / region — Verify
- No backup or PITR config in the repo. Confirm the Firestore location (cannot be changed later; India region preferred) and enable PITR + scheduled backups. **Task:** P0-07.

### SEC-12 [P2] Patient doc has no field allow-list — Confirmed
- `patients/{uid}` accepts any fields from the owner. **Fix:** rules `hasOnly` list + type checks. **Task:** P0-04.

### SEC-13 [P1] Consent record is thin — Confirmed
- Checkbox text says "record these details to arrange this appointment" but the stored field is `consentToTreatment`; not timestamped, not versioned, no link to a policy. **Fix:** store `consent:{ version, acceptedAt, purposes[] }`. **Task:** P1-LEGAL.

---

## C. UX and missing features

### UX-01 Booking flow
- **[P1]** No review/confirm step, no dedicated success page, no printable/shareable confirmation.
- **[P1]** No SMS/WhatsApp/email confirmation or reminder; no self-service cancel/reschedule link.
- **[P1]** Collects only name/phone/reason. Missing: age or DOB, sex, email (optional), new vs follow-up, preferred language. No phone-number validation/normalisation.
- **[P2]** Slot length (20 min), window (14 days), hours are hard-coded in the UI.
- **[P2]** Availability is not live; a slot taken meanwhile is only discovered on submit.

### UX-02 Patient portal
- **[P1]** No clinic-issued content: no visit summaries, prescriptions, reports, follow-up reminders.
- **[P2]** "Document records" are text only (UI hints uploads are "the next step").
- **[P2]** No family/dependents (one phone commonly serves several patients).

### UX-03 Staff workspaces
- **[P1]** Reception: no walk-in registration, no token/queue, no search by name/phone, no day sheet, "New booking" sends staff to the public page and tags it `patient_portal`.
- **[P1]** No cancellation reason or patient notification on staff cancel.
- **[P2]** Date exceptions: single window only, no delete/edit list, no upcoming-exceptions view.
- **[P2]** Developer wording leaks into UI ("Check the administrator role assignment", "needs Blaze"). Show human messages; log details.
- **[P2]** No filters/pagination/print on lists; no keyboard shortcuts for a reception desk.
- **[P1]** Admin has no reports, no clinic settings screen (rule exists, UI does not).

### UX-04 Public site content and trust
- **[P0]** No clinic phone number, WhatsApp or email anywhere.
- **[P1]** Consultation hours hard-coded on About and Contact; they will contradict the doctor's live schedule.
- **[P1]** "In-clinic & video visits" advertised on Home/About; no video feature exists.
- **[P1]** Missing: services/conditions treated, fees, FAQs, what to bring, "in an emergency go to the nearest hospital" notice, Google reviews/credentials proof, privacy policy, terms.
- **[P2]** Generic hot-linked stock photos undermine trust for a doctor's practice; use real clinic photos.
- **[P2]** Two `<h1>` on Home; public footer exposes "Staff access".

### UX-05 Navigation and auth pages
- **[P2]** No 404 page (every unknown URL redirects to Home). URL `/Booknow` is odd → `/book` with redirect.
- **[P2]** Auth pages: no show-password, no password-strength hint, no verify-email step, "Sign in" shown before "Book" priority.

---

## D. SEO, performance, accessibility

### SEO-01 [P1] Site is an empty shell to crawlers/link previews — Confirmed
- `index.html` has only `<title>`. No meta description, canonical, Open Graph/Twitter tags, JSON-LD (`MedicalClinic`/`Physician`), `robots.txt`, `sitemap.xml`, `lang`-specific metadata. Client-side rendering: prerender/static-generate the public pages. Mark `/staff/*`, `/patient/*`, `/login` `noindex`. **Task:** P3-SEO.

### PERF-01 [P2] One 818 KB JS chunk — Confirmed
- Public visitors download staff/admin/patient code. **Fix:** route-level lazy loading or two builds (see `03` §2). **Task:** P1-SPLIT.

### PERF-02 [P2] Hot-linked and heavy assets — Confirmed
- Hero images from Pexels/Unsplash; favicon from icons8 (third-party dependency + privacy leak); doctor photo 435 KB PNG; fonts via CSS `@import` (render-blocking). **Fix:** self-host, convert to WebP/AVIF with `srcset`, `font-display: swap`, preload the primary font. **Task:** P3-PERF.

### A11Y-01 [P1] Accessibility gaps — Confirmed (contrast: Verify)
- Auto-rotating carousel with no pause (WCAG 2.2.2), dots use `role=tablist` without panels.
- Day/slot pickers lack `aria-pressed`; disabled "Booked" buttons give no reason to screen readers.
- Error messages are not linked to fields (`aria-describedby`), no focus move to errors/success.
- Mobile menu: no focus trap, no Esc to close, scroll-lock toggled via `body.style`.
- Focus styles exist only for a few inputs (`:focus`); no `:focus-visible` system; no `prefers-reduced-motion`.
- Colour contrast unmeasured (light-blue text on white in several kickers).
- **Task:** P3-A11Y (and bake into `06`).

---

## E. Engineering quality

- **ENG-01 [P2]** Monolithic pages (UI + Firestore + rules of the business in one component), each 10–13 KB on very long lines.
- **ENG-02 [P2]** Copy-pasted helpers (`DOCTOR_ID`, `greeting`, date keys, auth guard, status batches). Extract to `lib/`, `hooks/`, `services/`.
- **ENG-03 [P1]** Hard-coded `brig-ak-sood` / `sood-clinic` / `gastroenterology` in rules, functions and UI blocks a second doctor or branch.
- **ENG-04 [P1]** No tests (no rules tests, no unit tests, no e2e), no CI, no emulator config, no staging project.
- **ENG-05 [P2]** `catch {}` swallows errors everywhere; no error boundary, no logging/monitoring.
- **ENG-06 [P2]** Dead code and files (see `01` §7).
- **ENG-07 [P3]** No formatter; add Prettier. `.env.example` describes a non-existent proxy. README is minimal.
- **ENG-08 [P3]** Package name is `client`; rename. Consider TypeScript or at least JSDoc types for the data model.
