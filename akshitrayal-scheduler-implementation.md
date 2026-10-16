# `akshitrayal-scheduler-implementation` — implementation log

Branch: `akshitrayal-scheduler-implementation`
Worktree: `/home/keshu/copilot-worktrees/hospital-management-system/akshitrayal-stunning-system`
Specs: `/home/keshu/Projects/PROMPT-A-scheduler.md` (scheduler), `/home/keshu/Projects/PROMPT-B-ui-redesign.md` (UI), `/home/keshu/Downloads/AI-PROMPT-next-tasks.md` (next tasks)
Repo checklist: `files/04-backlog.md`
Last updated: 2026-10-16

This file is the running log of what is implemented on this branch, how it is built, what is
verified, and what is still open. Append a dated entry to **Change log** every session and
update the card table below. Nothing here is a substitute for the acceptance criteria in
PROMPT-A Section 9: a card is only `done` when its own accept line passes.

## 1. Rules this branch works under (from PROMPT-A Section 0.1)

1. One card at a time; no extra features, no refactors of unnamed files.
2. No deploy, no Firebase Console, no billing, no secrets, no production data.
3. Never edit/delete `DESIGN.md`, `cal/`, `linear.app/`, `AI_STATE.md` (only ≤5 handoff lines).
4. Never reset/revert/clean the working tree — uncommitted work lives there.
5. No PHI or real contact details in code, logs, tests or commits (`Test Patient`, `+919000000001`).
6. Roles only from custom claims (`admin` / `doctor` / `manager`); a patient has no staff role.
7. Clinic time is IST only (`Frontend/src/lib/ist.js`, `functions/lib/ist.js`); never `Date` local
   getters or `toISOString().slice(0,10)` for clinic logic.
8. Firestore has no nested arrays — arrays of objects.
9. Missing value (key, domain, phone, decision) → stop and ask, never invent.
10. Mismatch between the card and the code → stop and report.
11. Pure logic in `functions/lib/` or `Frontend/src/lib/`, unit-tested.
12. Every new query → `firestore.indexes.json`; every new collection → `firestore.rules` + rules test.

Commands after every task (Section 0.2):

```bash
npm ci
npx vitest run tests/time tests/schedule functions/test
(cd functions && npm run lint)
npm --prefix Frontend run lint
npm --prefix Frontend run build
git diff --check
npm run test:rules        # only when the emulator ports are free
```

### 1.1 Run report format (user request, 2026-10-15)

Every run ends with a **boxed plain-text run card** (readable in any terminal, no markdown tables) *and*
regenerates `Frontend/dist/run-report.html` — self-contained (no remote fonts/images/scripts) and gitignored,
served by the dev server at `http://localhost:5173/dist/run-report.html`. Same five blocks every time:
requests delivered → what was verified (with counts) → files touched → bugs and limits → git state and next card.

## 2. Card status

| Card | Status | Evidence / remaining work |
|---|---|---|
| A0-01 engine (units + availability) | done | `functions/lib/engine/units.js`, `functions/lib/engine/availability.js`; all 12 accept cases in PROMPT-A §A0-01 have a test in `functions/test/engine/units.test.js` + `availability.test.js` |
| A0-02 visit types v2 | done | `functions/lib/engine/visitType.js` (+ every-bound tests), `functions/src/scheduler/visitTypes.js` (`saveVisitType`, `listVisitTypes`), `getBookingCatalog` returns both `visitTypes` and legacy `booking.visitTypes`, `functions/migrate-visit-types.js`, `AdminVisitTypes.jsx` calls the new callables, rules test denies `visitTypes` to browsers |
| A0-03 unit-lock placement | done (helpers added 2026-10-15) | (a) `functions/lib/engine/placement.js` + `functions/test/engine/placement.test.js`; (b)+(c) `functions/src/scheduler/placement.js`. Not yet called by any callable — that is A0-04 |
| A0-04 move callables to engine + unit locks | done (2026-10-15, session 2) | `functions/index.js` no longer imports `./lib/availability`; every slot writer/reader uses units. `getAvailability`, `getMonthAvailability`, `holdSlot`, `releaseHold`, `createBooking`, `createStaffAppointment`, `moveAppointment`, `rescheduleBookingByToken`, `reschedulePatientAppointment` use `computeDaySlots`; cancel/close-day paths call `releaseUnitsInTransaction`; `functions/migrate-slot-units.js` added; `functions/lib/availability.js` + `functions/test/availability.test.js` deleted (cases ported to `functions/test/engine/availability.test.js`); `functions/test/scheduler/placement.test.js` exercises the transaction helper |
| A0-05 private data + new rules | done (2026-10-15, session 3) | `functions/index.js` no longer writes `createdBy`, `calendarId` or `eventId` on the appointment; `appointmentPrivate` now holds `manageTokenHash`, `createdByUid`, `calendarId`, `eventId`. `syncAppointmentToGoogle`, `deleteAppointmentFromGoogle` and the reschedule path read/write through `appointmentPrivateRef` + `calendarIdsFrom` + `publicSyncState`, with a one-time copy of legacy identifiers. Rules test now covers all five roles × every server-only collection. The appointment doc still keeps `{provider, syncStatus, lastSyncError, lastSyncedAt}` |
| A0-06 references + tokens | done | `functions/lib/engine/reference.js`, `functions/lib/tokens.js` (`newManageToken`, `hashToken`, `tokensEqual` with length-mismatch guard), tests incl. the 1,000-reference alphabet check |
| A0-07 error reasons + copy | done | `functions/src/scheduler/errors.js` (`schedulerError`), `Frontend/src/lib/bookingErrors.js`; `bookingErrors.test.js` asserts the full reason→copy table and the default fallback |
| A1-01 month-wide `getMonthAvailability` | done (2026-10-15, session 3) | New `functions/src/scheduler/availabilityCallables.js` (spec 6.2) replaces the old inline callable: one read per source for the month, pure `groupUnitsByDate` actually used, one `freeBusy` request for the month, dailyLimit counts only fetched when a visit type caps a day, `nextAvailable` from today, and a past/out-of-window malformed month refused instead of silently returning no days |
| A1-02 `createBooking` v2 | done (2026-10-15, session 4) | `functions/lib/engine/bookingInput.js` (`validateBookingInput`, `CONSENT_VERSION`, 25 test vectors in `functions/test/engine/bookingInput.test.js`); `createBooking` takes the §6.6 input (`startsAt`, `holdId`, `consent:{version}`, `intake`) and writes the §4.3 fields, `contact`, `patientRegistryId` (registry lookup by phone) and `ipHash`/`manageCreatedAt` on `appointmentPrivate`; `functions/src/scheduler/notify.js` is called after commit (`enqueueForAppointment('booking_confirmed', id)`) and is a no-op until A2-03. Response is `{appointmentId, reference, status, idempotent, startsAt, endsAt, manageToken, visitType, doctor}`. `Bookappointment.jsx` sends the new payload. The interim `dateKey`/`time`/`consentVersion`/`holdToken` shape was still accepted so the deployed page kept booking; **A1-03 removed it** (2026-10-16) |
| A1-03 holds | done (2026-10-16, session 5) | `functions/src/scheduler/holds.js` (`createHoldHandlers`, `isHoldId`) implements §6.4–6.5: `holdSlot` takes `{doctorId, visitTypeId, startsAt, holdId}` and returns `{holdId, expiresAt}` (5 minutes), `releaseHold` takes `{doctorId, holdId}`; the hold id is hashed before it reaches the units, at most one active hold per id is kept, and the same-hash `claimHoldId` conversion lives in `createBooking`. 8 vectors in `functions/test/scheduler/holds.test.js` drive the real engine through fakes. Found and fixed on the way: expired holds never counted as expired in placement, and every callable shared one `rateLimits` counter |
| A1-04…A5-06 | not started as cards | Several features exist in a first form but are built on the legacy engine or without the card's UI prerequisites (Prompt B B-01…B-12). They are deliberately **not** ticked. See §5 |

Ledger in `PROMPT-A-scheduler.md` §12 is kept in sync with this table.

## 3. What exists on this branch, and how it is built

### 3.1 Pure engine (`functions/lib/engine/`, no Firebase imports)

| File | What it does |
|---|---|
| `units.js` | `GRID_MINUTES = 5`; `alignDown`/`alignUp` (5-minute boundaries); `istUnitId(doctorId, date)` → `${doctorId}_${yyyyMMddHHmm}` in IST; `unitSlotsForRange(doctorId, start, end)` → `[{id, startsAt, endsAt}]` per 5-minute unit (added A0-04); `unitIdsForRange` = the same ids |
| `availability.js` | `computeDaySlots({dateKey, now, doctorId, visitType, weeklySessions, exception, blocks, occupiedUnitIds, activeCountForType})` implementing PROMPT-A §5.3: windows from weekday sessions + `closed`/`extra`/`replace` exceptions, merged; candidates stepped by `intervalMinutes`; rejects notices, past dates, dates beyond `maxAdvanceDays`, buffer-expanded ranges hitting occupied units, blocks, and a reached `dailyLimit`. `now` is always injected |
| `placement.js` | `planPlacement({candidateUnitIds, existingUnits, now, claimHoldId, claimAppointmentId})` → `{ok:true}` or `{ok:false, conflictUnitId}`; an expired `hold` does not conflict, and a unit the caller already owns (its own hold, or the appointment's own locks) is claimable (A0-04) |
| `visitType.js` | `validateVisitType` — label ≤ 80, slug `^[a-z][a-z0-9-]{1,60}$`, mode enum, minutes/interval 5–240 multiples of 5, buffers 0–120, minNotice 0–10080, maxAdvance 1–180, colour enum, ≤ 8 intake questions with per-question bounds, `pricePaise`, `sortOrder` |
| `reference.js` | `newReference()` = `SC-` + 8 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, injectable `randomInt` for tests |

Supporting libs: `functions/lib/tokens.js`, `functions/lib/notifications.js`, `functions/lib/ist.js`.

### 3.2 Callables (`functions/src/scheduler/*`, re-exported from `functions/index.js`)

`functions/index.js` line 23: `Object.assign(exports, require('./src/scheduler'))`.

| File | Exports |
|---|---|
| `src/scheduler/index.js` | `listVisitTypes`, `saveVisitType` |
| `src/scheduler/visitTypes.js` | admin-only, audited (`auditLogs`), validates with `validateVisitType`, `publicVisitType` projection for the catalogue; `listVisitTypes` falls back to the legacy `clinic/publicConfig.visitTypes` when the collection is empty |
| `src/scheduler/errors.js` | `schedulerError(code, reason, message)` → `HttpsError` with `{ reason }` so the UI can map it |
| `src/scheduler/placement.js` | `placeAppointmentInTransaction(...)` (`kindForCore`/`kindForBuffer`, `claimHoldId`, `claimAppointmentId`, `now`), `releaseUnitsInTransaction(...)` (A0-03 b/c); wired into every callable by A0-04 |

### 3.3 Data boundary (`firestore.rules`)

Server-only (browser read and write denied): `appointmentPrivate`, `waitlist`, `visitTypes`,
`bookingReferences`, `calendarFeeds`, `notifications`, `auditLogs`, `rateLimits`, `counters`,
`patientDirectory`, `patientLinkRequests`.
Staff read / server write: `calendarBlocks`, `appointments/{id}/staffNotes`.
`appointments` and `appointmentSlots` stay browser-write-denied; staff calendar reads are bounded
by `doctorId` + `dateKey` range. Tests: `tests/rules/*.test.js` (emulator).

### 3.4 Booking, tokens and patient flow (unit locks as of A0-04)

- Availability (`getAvailability`, `getMonthAvailability`, `holdSlot`) loads the doctor, weekly
  sessions, exception, blocks (`calendarBlocks` + Google free/busy), **all unit docs for that doctor
  and day** and the day's active count for the visit type, then calls `computeDaySlots`. Visit-type
  timing (minutes, buffers, notice, window, interval, daily limit, confirmation mode) is read from
  `visitTypes/{id}` with the legacy `clinic/publicConfig` values as the fallback until the visit
  type migration has run.
- `createBooking` places the booking with `placeAppointmentInTransaction` (all units in
  `slotIds`), can claim the units its own `holdToken` locked, and honours
  `requiresConfirmation` for the initial status. `createStaffAppointment`, `moveAppointment`,
  `reschedulePatientAppointment` and `rescheduleBookingByToken` place the new units and release the
  ones the appointment no longer occupies in ONE transaction; cancel paths
  (`cancelBookingByToken`, `cancelPatientAppointment`, `transitionAppointment` → cancelled,
  `closeDay`) release every unit.
- `createBooking` writes a `SC-` reference, an `appointmentPrivate/{id}` doc holding only the
  SHA-256 `manageTokenHash`, returns the clear `manageToken` once, and enforces the per-phone cap
  and IP rate limits.
- Guest manage: `getBookingByToken`, `cancelBookingByToken`, `rescheduleBookingByToken`
  (hash comparison through `tokensEqual`).
- Public UI: `/book` → `Frontend/src/pages/Bookappointment.jsx` (catalogue-driven doctor and visit
  type, month calendar, slots, holds, details, consent, waitlist recovery, slot-race recovery);
  `/booking/:reference` → `Frontend/src/features/scheduler/ConfirmationPage.jsx` (lookup, cancel
  with a required reason through `ConfirmDialog`, reschedule, `.ics` download via
  `features/scheduler/ics.js`, WhatsApp click-to-chat sharing); `/privacy` and `/terms` →
  `pages/Legal.jsx`; consent banner in `components/ConsentBanner.jsx`.
- Patient portal (`PatientPortal.jsx`) drives the existing patient callables.
- Staff: `ManagerWorkspace.jsx` (day queue, tokens, status actions, printable day sheet, patient
  registry/book-on-behalf), `DoctorWorkspace.jsx` (doctor-claim-scoped queue), `DoctorSchedule.jsx`
  (week board, exceptions, close-day preview/apply), `StaffCalendar.jsx`, `StaffSessionGuard.jsx`
  (idle timeout).

### 3.5 Frontend scheduler support

| Path | What |
|---|---|
| `services/schedulerService.js` | thin wrappers over the scheduler callables |
| `hooks/useDaySlots.js`, `hooks/useMonthAvailability.js`, `hooks/useSchedulerRequest.js` | cached availability reads that drop stale responses |
| `features/scheduler/layoutEvents.js` (+ test) | overlap layout used by calendar views |
| `features/scheduler/stateMachine.js` (+ test) | frontend mirror of the server transitions |
| `features/scheduler/ics.js` (+ test) | client-side `.ics` text for the download button |
| `lib/bookingErrors.js` (+ test) | reason → friendly copy |

## 4. Validation status (last run 2026-10-16, session 5, in this worktree)

| Command | Result |
|---|---|
| `npm ci` | pass (run 2026-10-15 session 1; not re-run in session 5 — no dependency changed) |
| `npx vitest run tests/time tests/schedule functions/test` | pass — 86/86, 16 files (`functions/test` alone: 80/80, 14 files; +8 for `functions/test/scheduler/holds.test.js`) |
| `npx vitest run` (whole repo) | 94 pass, 14 skipped, 1 file fails **only** because `tests/rules/default-deny.test.js` needs the emulator (see `npm run test:rules`) |
| `firebase emulators:exec --only firestore,functions` + one-off script | pass — 47/47: real callables `getAvailability`, `getMonthAvailability`, `holdSlot`, `releaseHold` (§6.4–6.5 contract, own-hold re-hold, foreign hold id, one-active-hold-per-id, release), `createBooking` (v2 input, rejection reasons, refusal of the removed interim shape, idempotent replay, booking over an expired hold), `getBookingByToken`, `cancelBookingByToken`; asserts the written documents, the §4.3 fields and that the month response agrees with the day response |
| `(cd functions && npm run lint)` | pass |
| `npm --prefix Frontend run lint` | pass |
| `npm --prefix Frontend run build` | pass (pre-existing large-chunk warning: staff `index` 738.83 kB → 225.98 kB gzip) |
| `git diff --check` | pass |
| `npm run test:rules` | pass — 14/14 (emulator) |

Not verifiable from this worktree (report as unknown, do not assume): App Check enforcement and
reCAPTCHA keys, API-key restrictions, Firestore region, billing plan/budget, whether deployed
rules/indexes/functions match this branch, email/WhatsApp provider decision and secrets, whether
production data exists.

## 5. Known gaps in the existing feature work

- **Legacy single-slot data.** Any `appointmentSlots` document written before A0-04 is still a
  single doc per appointment. The engine expands such docs to the units they cover, so they keep
  blocking availability, but the appointments themselves have one legacy id in `slotIds` until
  `functions/migrate-slot-units.js` is run with `CLINIC_APPLY_SLOT_MIGRATION=true` (dry run first).
- **Global booking config fallback.** Buffers/notice/interval/window come from `visitTypes/{id}`
  now, but fall back to `clinic/publicConfig` for every visit type that has not been migrated yet
  (limit L1, closed by `functions/migrate-visit-types.js` + A1-01).
- **Self-overlap on reschedule.** A patient or staff member cannot move an appointment to a time
  that overlaps the units the appointment itself still holds, because those units are part of the
  availability input. Move/reschedule is fine to a non-overlapping time. A0-05/A1-04 territory.
- **`createStaffAppointment` was dead on arrival.** It read `queueRef` without defining it
  (ReferenceError on every call); A0-04 added the missing declaration. Worth telling the client
  that front-desk booking never worked.
- **Internal fields on the patient-readable appointment.** `createdBy` and
  `externalCalendar.{calendarId,eventId}` (limit L9 remainder).
- **Notifications** are an outbox (`notifications`, `processNotification`,
  `processNotificationQueue`, `sendReminders`) with a webhook/log provider only — no real email
  provider, no `.ics` attachment, no template tests yet (A2-01…A2-04). A1-02 replaced the inline
  `appointment_confirmation` write with `enqueueForAppointment('booking_confirmed', id)`, which is a
  no-op today: **a booking no longer queues any notification until A2-03 fills the outbox in.**
  Nothing is lost in practice — the old document only reached the unconfigured webhook and dead-lettered.
- **Booking input compatibility — closed by A1-03 (2026-10-16).** `createBooking` now reads only the
  §6.6 input: `startsAt` must be an ISO instant and `consent.version` is the only accepted consent
  shape, so the interim `dateKey`/`time`/`consentVersion`/`holdToken` payload is refused with the
  plain "Choose a valid appointment time." message. `Bookappointment.jsx` sends `startsAt` and a
  client-generated `holdId`. The deployed Hosting bundle still sends the interim shape until the
  next hosting deploy — front-desk/phone bookings are unaffected, but **online booking on the live
  site will fail until hosting is redeployed** (the page and the callables must ship together).
  `branchId`/`departmentId` remain out of the input (§6.6); the stored appointment takes them from
  the doctor record.
- **Age and visit-kind extras.** `validateBookingInput` still accepts `patient.ageYears` and
  `patient.visitKind` and stores them in `patientSnapshot`, although §6.6 lists only
  `{name, phone, email?, dob?, sex?}`. They stay until A1-06 rebuilds the details form (removing
  them server-side now would silently drop the age and new/follow-up the page collects).
- **Token callables share the booking allowance.** `getBookingByToken`/`cancelBookingByToken`/
  `rescheduleBookingByToken` call `enforceBookingRateLimit` (10/hour) although §6 gives token
  callables 30/hour; A1-04 owns those callables. Each limit now has its own `rateLimits` bucket, so
  this is a wrong number, not a shared counter.
- **No staff calendar grid, no drag/move, no drawer, no command palette** (A3-02…A3-11), no
  reports (A5-01), no ICS feed (A4-03), no cleanup job (A4-04), no Playwright E2E (A5-04).
- **Prompt B** (B-01…B-12: tokens, base components, shells) is not implemented, so every card
  marked `UI` is blocked by PROMPT-A §0.4 even where a functional screen exists.

## 6. Next card

`A1-04 · Guest manage callables and shared internals [L] · depends: A0-06, A1-02` —
`functions/src/scheduler/manage.js` with internal `cancelAppointmentCore`/`rescheduleAppointmentCore`
(policy from `functions/lib/appointmentPolicy.js`), the three token callables on top of it, and
`cancelPatientAppointment`/`reschedulePatientAppointment` refactored onto the same cores; the token
allowance becomes 30/hour (§6) while it is in there. A1-04 also owns the self-overlap gap below §5.

### Superseded card notes (A1-03)

`A1-03 · Holds [M] · depends: A0-03, A1-02` — `functions/src/scheduler/holds.js` with contracts
6.4/6.5: `holdSlot` verifies the slot is currently offered by `computeDaySlots` and locks units with
`kind:'hold'`, a client-generated `holdId` (16–64 random characters) and `expiresAt = now + 5 min`;
`createBooking` converts the units of that `holdId` instead of conflicting; `releaseHold` takes
`{doctorId, holdId}`. **Done 2026-10-16**, together with removing the interim input branch from
`createBooking` and `Bookappointment.jsx` (see §5 for what that means for a Hosting deploy).

### Superseded card notes (A1-02)

`A1-02 · createBooking v2 [L] · depends: A0-03, A0-04, A0-05, A0-06` — sub-steps (a) pure
`validateBookingInput(input, visitType)` in `functions/lib/engine/bookingInput.js` with tests (name,
phone via `toE164`, optional lower-cased email, optional `dob`, `sex` enum, `reason` ≤ 500, `intake`
answers ≤ 500 with required questions answered, `consent.version` equal to the current
`CONSENT_VERSION`); (b) `createBooking` uses it, resolves the visit type from the collection, sets
`requiresConfirmation ? 'scheduled' : 'confirmed'`, stores the §4.3 fields, creates `appointmentPrivate`
and `bookingReferences/{reference}`, places units, keeps idempotency via `bookingRequests`, keeps the
per-phone cap and IP throttle; (c) after commit calls `enqueueForAppointment('booking_confirmed', id)`
from `functions/src/scheduler/notify.js` (create it as a no-op returning immediately; A2-03 fills it).

**A1-02 is done, and this note no longer applies to `createBooking`.** It reads the §6.6 input
(`startsAt`, `holdId`, `consent:{version}`, `patient`, `intake`) and `Bookappointment.jsx` sends that
shape; the interim shape is still accepted as a compatibility branch until A1-03 lands. `holdSlot`
still takes `{dateKey, time}` and returns `holdToken` — A1-03 replaces both with
`{doctorId, visitTypeId, startsAt, holdId}` and `{holdId, expiresAt}`, and must delete the
compatibility branch at the same time.

Then A1-04 (guest manage callables on the shared internals, §6.7–6.9), A1-05 (frontend service/hooks
— `useMonthAvailability` and `schedulerService.js` already exist), A1-06…A1-09.

## 7. Change log

### 2026-10-16 (session 5, A1-03)

- **A1-03 done.** Holds now live in `functions/src/scheduler/holds.js`:
  - `holdSlot({doctorId, visitTypeId, startsAt, holdId})` → `{holdId, expiresAt}` (§6.4). It asks the
    same `computeDaySlots` context the availability callables use, so a hold can only lock a time the
    engine is offering right now; the five-minute expiry and the `kind:'hold'` units are unchanged,
    and the stored `holdId` is the SHA-256 hash, so the units hold no secret.
  - At most one active hold per `holdId` (§6.4): re-holding a different time deletes that id's older
    units after the new ones are written.
  - A guest can re-hold its own time — needed because a live hold hides the time from the engine —
    through `unitsHeldBy`, moved from `index.js` into `src/scheduler/placement.js` and shared with
    `createBooking`'s hold-claim path.
  - `releaseHold({doctorId, holdId})` → `{ok:true}` (§6.5) deletes only that doctor's `kind:'hold'`
    units for that hash, and both callables are throttled under their own `hold` bucket (20/hour).
- **The interim booking input is gone** (`index.js`, `lib/engine/bookingInput.js`): `startsAt` is
  required, `consent.version` is the only accepted form, and `Bookappointment.jsx` now generates one
  hold id per page visit with `crypto.randomUUID()` and sends the same id to `holdSlot` and
  `createBooking`.
- **Two defects found by the emulator run, both fixed:**
  - *Expired holds blocked bookings.* `lib/engine/placement.js` compared `new Date(unit.expiresAt)`,
    and Firestore returns `expiresAt` as a Timestamp for which `new Date(ts)` is an **Invalid Date**:
    the comparison was always false, so an expired hold was treated as a live conflict while
    availability (which coerces with `toDate()`) correctly ignored it. Now both use a tolerant
    `asMillis`, covered by a Timestamp-shaped test.
  - *One `rateLimits` counter for every callable.* `enforceRateLimit` keyed the document on the IP
    hash alone, so 20 holds exhausted `createBooking`'s 10/hour allowance for the same caller. The
    bucket name is now part of the document id (`hold_…`, `booking_…`).
- Checks in this worktree: vitest 86/86 (16 files), rules 14/14, functions + frontend lint, both
  bundles built, `git diff --check`, and the emulator script **47/47**. `npm ci` was not re-run (no
  dependency changed). No deploy, no billing, no production data change.

### 2026-10-15 (session 4, A1-02)

- **A1-02 done.** The three sub-steps of the card:
  - **(a)** `functions/lib/engine/bookingInput.js` — pure `validateBookingInput(input, visitType,
    { now })` implementing §6.6: name 2–120, phone through `toE164`, optional email (≤254, stored
    lower-cased), optional `dob` (`YYYY-MM-DD`, real date, not in the IST future, not before 1900),
    `sex` enum, `reason` ≤ 500, `intake` keyed by the visit type's questions with required ones
    answered and each answer ≤ 500, and `consent.version === CONSENT_VERSION` (`booking-v1`). It
    returns `{ ok: false, reason, fields }` — one A0-07 reason for the banner plus per-field messages
    for the form — or a whitelisted `value`. 25 test vectors (`functions/test/engine/bookingInput.test.js`).
  - **(b)** `createBooking` resolves the visit type first (`resolveVisitType`, collection first, legacy
    config fallback), validates, then loads the day context and places the units. Writes the §4.3
    fields (`visitTypeId`, `visitTypeLabel`, `durationMinutes`, both buffers, `contact`,
    `patientRegistryId`, `source`, `tokenNumber`, `checkedInAt/startedAt/completedAt`, `reminders`,
    `intake`), keeps `visitType`/`visitMode`/`patientSnapshot` for the readers that predate the spec
    (`dayActiveAppointmentCount`, `publicAppointmentView`, `getDoctorPatientSummary`, staff lists),
    and keeps idempotency, the per-phone cap and the IP throttle. `appointmentPrivate` now also holds
    `manageCreatedAt` and `ipHash` (§4.3b). Response: `{appointmentId, reference, status, idempotent,
    startsAt, endsAt, manageToken, visitType, doctor}`.
  - **(c)** `functions/src/scheduler/notify.js` — `enqueueForAppointment(type, appointmentId)`, a no-op
    that returns immediately (A2-03/A2-01 fills it); called after the commit, before the calendar sync,
    as §5.4 orders. The inline `appointment_confirmation` transaction write is gone.
- **§6.6 input change, with a temporary compatibility branch.** The callable reads `startsAt` (ISO),
  `holdId`, `consent:{version}` and `intake`, and still accepts `dateKey`+`time`, `consentVersion` and
  `holdToken` so the deployed Hosting bundle keeps booking until it is rebuilt. `holdSlot` is
  unchanged this card, so the page sends `holdId: hold.holdToken` — the server hashes whatever secret
  it is handed, which is exactly the value the hold wrote. A1-03 removes the branch.
- **`branchId`/`departmentId` left the input** (§6.6 has one doctor and one visit type): the stored
  appointment takes them from the doctor record, as `createStaffAppointment` already did, and the
  "is this clinic service available" check is now the `availabilityContext` doctor check. No browser
  privilege was widened — both were browser-supplied and are now server-derived.
- **New error reasons** on `createBooking`'s own failures (`SLOT_UNAVAILABLE`, and the validator's
  `INVALID_PHONE`/`INVALID_EMAIL`/`CONSENT_REQUIRED`/`VALIDATION`), so the page can pick copy from
  `error.details.reason`. The shared helpers (`enforceBookingRateLimit`, `assertPhoneBookingCapacity`)
  still raise reason-less errors; converting them touches every public callable and belongs with A0-07's
  remaining wiring, not this card.
- **Bug fixed in `Bookappointment.jsx` (pre-existing, from A1-05's service layer):** the day-slot
  effect destructured `{ data }` from `getAvailability`, but `schedulerService` already unwraps
  `result.data`, so the destructuring threw inside `.then` and every day rendered "Something went
  wrong…" with no times. The month effect was already correct. Also: the details step's Age field is
  still accepted by the validator (`ageYears`, optional 0–120) because the page collects it and
  `getDoctorPatientSummary` reads `visitKind` — both are documented extras, not §6.6 fields.
- Checks (all pass): `npx vitest run tests/time tests/schedule functions/test` 78/78 (15 files);
  whole repo 86 pass + 14 skipped + the emulator-only rules file; functions lint (now syntax-checks
  `bookingInput.js` and `notify.js`); frontend lint; both bundles build; `git diff --check`;
  `npm run test:rules` 14/14; emulator end-to-end **39/39** — including the §6.6 response, the §4.3
  fields on the written document, `INVALID_PHONE`/`CONSENT_REQUIRED` rejections, a rejection for an
  unusable `startsAt`, and an interim-shape booking that still succeeds.
- Acceptance for "`manageToken` is never logged or stored in clear": `grep -n "manageToken" functions`
  shows only `newManageToken()`/`hashToken()` uses, the once-only response field and the `releaseHold`
  doc comment; the e2e check asserts the response contains no `tokenHash` and `appointmentPrivate`
  stores only the SHA-256 hash.
- Not touched: `firestore.rules`/indexes (no new collection or query shape), `holdSlot`/`releaseHold`
  (A1-03), A1-04 onwards, Prompt B.

### 2026-10-15 (session 3, continued)

- **A1-01 done.** `getMonthAvailability` now matches spec 6.2 and lives in
  `functions/src/scheduler/availabilityCallables.js` (`createAvailabilityCallables({ db, callableOptions,
  loadConfig, resolveVisitType, loadExternalBusy })`, wired from `functions/index.js` where those
  clinic-specific loaders live). Old behaviour: `Promise.all` over every date, each day calling
  `availabilityContext` (doctor, schedule, exception, config, blocks, external free/busy, active-count)
  — ~30× the reads plus one Google free/busy request per day. Now: the doctor once, then one read each of
  `doctorSchedules`, `scheduleExceptions` (doctorId + dateKey range), `calendarBlocks` (same range),
  `appointmentSlots` (same range) and ONE `freeBusy` request for the month; the appointment-count query
  runs only when `visitType.dailyLimit !== null`, so the common case is 7 reads for a whole month.
- **New pure engine helpers** in `functions/lib/engine/availability.js`: `monthDateKeys({month, today,
  maxAdvanceDays})` (all IST dates of the month; malformed → `VALIDATION`, past or wholly out-of-window
  month → `OUTSIDE_WINDOW`), `groupUnitsByDate(units, {now, doctorId})` (per-date busy unit ids, expired
  holds dropped, legacy single-range docs expanded) and `groupRangesByDate(ranges, dates)` (buckets
  blocks and external busy time into the IST days they touch; a range ending exactly at IST midnight
  belongs to the earlier day). Tests: 6 new cases in `functions/test/engine/availability.test.js` (now 11).
- Contract-aligned response: `{ timezone, month, days:[{dateKey, available, slotCount}], nextAvailable:
  {dateKey,time}|null }`. The interim extra `days[].firstTime` is gone — no UI reads it (checked
  `Frontend/src`); `Bookappointment.jsx` uses only `dateKey`/`available`/`slotCount`, and it already
  handles a month error by marking the days unavailable, which is what a refused past month now returns.
- **`isActiveAppointment` moved** from `functions/index.js` to `functions/lib/appointmentPolicy.js`
  (verbatim semantics: anything but `cancelled`/`completed`/`no_show` counts as active, unknown included)
  so the month loader counts a day's appointments the same way. 1 new test.
- **`externalBusyRanges` is now range-capable** (`{doctorId, fromDateKey, toDateKey = fromDateKey}`);
  the day path passes only `fromDateKey`, so its behaviour is unchanged.
- **The functions lint script (`node --check`)** now also checks `src/scheduler/availabilityCallables.js`;
  it did not police new files by itself.
- Checks (all pass): `npx vitest run tests/time tests/schedule functions/test` 53/53 (whole repo 61 pass +
  14 skipped + the emulator-only rules file); functions lint; frontend lint; both bundles build;
  `git diff --check`; emulator end-to-end 30/30, including 11 new month checks (day/month agreement,
  a no-session weekday at 0, days before today closed, `nextAvailable` from today, refused past and
  malformed months, a live hold lowering the month count and its release restoring it, and 2
  back-dated hold units ignored).
- Card acceptance for "31-day month produces exactly one unit-docs query": verified **by reading** -
  `appointmentSlots` is queried exactly once, with `doctorId ==` and a `dateKey` range, before the day
  loop; the loop only calls pure `computeDaySlots` per day.
- Advice to the next session: the callable's `secrets` are passed through `callableOptions`; if you add
  another clinic-specific loader, add it to the factory call in `index.js`, not to the module.
- Not touched: A1-02 onwards, Prompt B, `firestore.rules` / indexes (the month queries use the existing
  `(doctorId, dateKey)` composites).

### 2026-10-15 (session 3, A0-05)

- **A0-05 done.** `createdBy` and `externalCalendar.{calendarId,eventId}` no longer exist on the
  appointment (patient-readable). New helpers in `functions/index.js`: `appointmentPrivateRef`,
  `calendarIdsFrom`, `publicSyncState`, `appointmentCalendarIds`. `syncAppointmentToGoogle` and
  `deleteAppointmentFromGoogle` read/write the ids through `appointmentPrivate`; a pre-move appointment
  is copied across once so its Google event is never orphaned, and writing the sync status replaces the
  whole `externalCalendar` map, which drops the legacy identifiers. `appointmentPrivate` now holds
  `{ appointmentId, manageTokenHash, createdByUid, calendarId?, eventId? }`.
- **Rules coverage** (`tests/rules/default-deny.test.js`, now 14 tests): one new test runs all five
  roles (anonymous, patient, manager, doctor, admin) × five server-only collections (`appointmentPrivate`,
  `waitlist`, `visitTypes`, `bookingReferences`, `calendarFeeds`) × read/write/delete = 75 assertions,
  plus "the owning patient reads the appointment but not its side document".
- **`firebase-admin` modular imports (user-approved, all 7 functions files, 143 sites):**
  `admin.firestore.Timestamp` / `admin.firestore.FieldValue` → `Timestamp` / `FieldValue` from
  `firebase-admin/firestore`. Production behaviour is unchanged, but firebase-tools' emulator *stubs*
  `firebase-admin` and `Function.bind` drops those statics, so before this change **no** callable that
  touched them could run in the emulator at all.
- **Three real bugs found by the new emulator run and fixed:**
  1. `createStaffAppointment` used an undefined `queueRef` (every front-desk booking threw).
     *Found in session 2, listed again here because it is the same class of defect.*
  2. A hold tagged its buffer units `kind:'buffer'`, so `releaseHold`, hold expiry and the
     "claim my own hold" check only saw the core units — booking the held time failed with
     `SLOT_TAKEN`/"no longer available". Holds now pass `kindForBuffer:'hold'` (unit + regression test).
  3. References were generated as hex (`SC-` + 4 random bytes), which `findGuestAppointment`'s
     alphabet regex rejects whenever the hex contains `0` or `1` — roughly two out of three guest manage
     links returned "We could not find this booking". `createBooking` and `createStaffAppointment` now
     use `newReference()` from `functions/lib/engine/reference.js` (the A0-06 engine), and both write
     `bookingReferences/{reference}` as §5.4 requires.
- **A retried booking now returns the original result.** `createBooking` reads
  `bookingRequests/{clientRequestId}` before doing availability work, so a double submit or network
  retry gets its confirmation instead of "that time is no longer available".
- **Docs:** `files/03-target-architecture.md` appointment/`appointmentPrivate` block updated (rule 9).
- Checks (all pass): vitest `tests/time tests/schedule functions/test` 47/47; whole repo 55 pass + the
  emulator-only rules file; functions lint; frontend lint; dual build; `git diff --check`;
  `npm run test:rules` 14/14; emulator end-to-end 19/19.
- Bookkeeping: PROMPT-A §12 ticks `A0-05`; `AI_STATE.md` got one handoff line.
- Not touched: A1 onwards, Prompt B.
- New findings, not fixed (deliberately outside the card — each needs its own migration + rules test):
  `doctorSchedules` is world-readable but stores `updatedBy` (a staff uid); `patients.createdBy`
  exposes the registering staff uid to the owning patient; `appointments/{id}/staffNotes` stores
  `{ note, createdBy }` where §4.4 specifies `{ text, authorUid, authorRole }`.

### 2026-10-15 (session 2)

- **A0-04 (a)**: `getAvailability` and `getMonthAvailability` load the day's unit docs
  (`dayOccupiedUnits`, which also expands legacy single-slot docs and skips expired holds),
  blocks + Google free/busy, and the day's active count for the visit type, then call
  `computeDaySlots` through a new `daySlotsFor` helper. Visit-type timing is resolved by
  `resolveVisitType` (stored `visitTypes/{id}` first, legacy `clinic/publicConfig` fallback). The
  response keeps `slotId` for the existing UI — it is now the first core unit id.
- **A0-04 (b)**: `createBooking` places the booking with `placeAppointmentInTransaction`, stores
  every unit id in `slotIds`, claims the units its own `holdToken` locked (`claimHoldId`), and takes
  its initial status from the visit type's `requiresConfirmation`.
- **A0-04 (c)**: `cancelBookingByToken`, `cancelPatientAppointment`, `transitionAppointment` (to
  `cancelled`) and `closeDay` all release units through `releaseUnitsInTransaction`, via the
  `appointmentUnitIds` helper (which still accepts the legacy single `slotId`).
- **A0-04 (d)**: `rescheduleBookingByToken`, `reschedulePatientAppointment` and `moveAppointment`
  validate against the engine, then place the new units and release the ones the appointment no
  longer occupies in ONE transaction. `claimAppointmentId` lets an appointment keep units that
  overlap its own previous time.
- **A0-04 (e)**: `functions/migrate-slot-units.js` — dry run by default, prints counts only (no
  patient data); with `CLINIC_APPLY_SLOT_MIGRATION=true` it creates the missing units (core first,
  then buffers), deletes the legacy docs and rewrites `slotIds`.
- **A0-04 (f)**: deleted `functions/lib/availability.js` and `functions/test/availability.test.js`;
  its cases (two weekly windows, canonical IST instants, blocks + external busy, exceptions, window,
  notice) now live in `functions/test/engine/availability.test.js`.
- **`holdSlot`/`releaseHold` converted too** (not a named sub-step, but they were the last writers of
  the old single-slot shape): a hold now locks units with `kind:'hold'`, `holdId = sha256(holdToken)`
  and a 5-minute `expiresAt`; `releaseHold` deletes only `kind:'hold'` docs whose `holdId` matches.
  The callable input/output shape is unchanged for the current UI (A1-03 replaces it with the
  `holdId` contract).
- **New test** `functions/test/scheduler/placement.test.js`: 6 cases over the transaction helper with
  a stub Firestore transaction — 40-minute booking = 8 core units, buffer tagging, `SLOT_TAKEN` with
  no writes, own-hold claim + expired hold, own-units claim on a move, release.
- **Bug found and fixed while rewriting**: `createStaffAppointment` read `queueRef` without defining
  it, so every front-desk booking threw a ReferenceError.
- Checks (all pass): `npx vitest run tests/time tests/schedule functions/test` 46/46;
  `npx vitest run` 54 pass + the emulator-only rules file; `(cd functions && npm run lint)` (now also
  `node --check migrate-slot-units.js`); `npm --prefix Frontend run lint`; `npm --prefix Frontend run
  build`; `git diff --check`; `npm run test:rules` 13/13.
- Bookkeeping: PROMPT-A §12 ticks `A0-04`; `AI_STATE.md` got one handoff line.
- Not touched: A0-05, everything from A1 onwards, Prompt B.
- Also this session (outside the card): a fresh Vite dev server was started for this worktree on
  `http://localhost:5173` (`--host 0.0.0.0`), and the Prompt B UI branch
  `akshitrayal-project-context-review` was deleted at the user's request — its 12 unmerged `ui:`
  commits are pinned at tag `backup/prompt-b-ui-redesign` (176cb22e) in the main clone.

### 2026-10-15 (session 1)

- Created this log after auditing the worktree against PROMPT-A Section 9 (state below is what the
  code shows, not what the earlier handoff claimed).
- A0-02: extended `functions/test/engine/visitType.test.js` so every documented bound has a vector
  (label, slug, mode, minutes, both buffers, interval, minNotice, maxAdvance, dailyLimit, colour,
  question fields, question count, pricePaise, sortOrder, requiresConfirmation, active).
- A0-03 (b)+(c): added `functions/src/scheduler/placement.js` —
  `placeAppointmentInTransaction` (reads all candidate units with `transaction.getAll`, plans with
  `planPlacement`, throws `SLOT_TAKEN` on conflict, then writes one doc per 5-minute unit with
  `kind:'core'` for the visit and `kind:'buffer'` for the buffers) and `releaseUnitsInTransaction`.
  No callable is wired to it yet (that is A0-04).
- A0-06: added the 1,000-reference alphabet vector to `functions/test/engine/reference.test.js`; the existing test already covered `tokensEqual` (equal, different, length mismatch).
- A0-07: `bookingErrors.test.js` now asserts the whole reason→copy table (17 keys, the two shared strings included) plus the unknown-code and thrown-`Error` fallbacks.
- A0-01 confirmed against all 12 accept cases; no code change needed.
- `functions/package.json` lint list now syntax-checks `src/scheduler/placement.js` (the list already enumerated the other scheduler files).
- Bookkeeping: PROMPT-A §12 ticks `A0-01, A0-02, A0-03, A0-06, A0-07`; `AI_STATE.md` got one handoff line. `A0-05` stays unticked (see §2), `A0-04` is next.
- Checks (all pass): `npm ci`; `npx vitest run tests/time tests/schedule functions/test` 39/39; `npx vitest run` 47 pass + the emulator-only rules file; `(cd functions && npm run lint)`; `npm --prefix Frontend run lint`; `npm --prefix Frontend run build`; `git diff --check`; `npm run test:rules` 13/13.
- Not touched: A0-04, A0-05, Prompt B, and everything from A1 onwards.
