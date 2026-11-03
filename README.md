# Sood Clinic

Firebase-backed appointment and clinic operations application for Sood Clinic, Panchkula
(Dr. Brig. A. K. Sood VSM (Retd), gastroenterology; House No. 398, Sector 10, Panchkula,
Haryana 134109).

## Project structure

- `Frontend/` — React 18 + Vite + Tailwind SPA. Two entries build separate bundles:
  `src/entry/public.jsx` → `dist/public` (public site, booking, patient portal) and
  `src/entry/staff.jsx` → `dist/staff` (role-based staff workspaces).
- `functions/` — Firebase Functions (Node 22, `asia-south1`): booking/availability, staff
  lifecycle, catalogue/contact/policy, calendar, feedback, video, and the SQL staff and
  scheduler backends. Local admin scripts: `seed.js`, `assign-staff-role.js`,
  `migrate-legacy-staff-role.js`.
- `firestore.rules`, `firestore.indexes.json` — Firestore access control and indexes.
- `firebase.json`, `.firebaserc` — Hosting (two sites on one project), Firestore,
  Functions and Data Connect configuration.
- `SQL/` — the SQL Connect backend: `dataconnect/` source (schema, connectors, admin
  operations), `generated/` committed SDKs, `scripts/` (compile, test, rehearse,
  release-check), `migration/` local migration/rehearsal tooling, `tests/`.
- `tests/` — rules, callable, booking, schedule, time and staff-access suites.

## Commands

Frontend:

```bash
cd Frontend
npm ci
npm run dev            # Vite dev server
npm run lint           # eslint, passes clean
npm run build          # both bundles → dist/public and dist/staff
npm test               # component/service tests (jsdom)
```

From the repository root (`npm ci` once):

```bash
npm run emulators        # Firebase emulators (demo-sood-clinic), UI on :4000
npm run test:time        # IST helper tests
npm run test:rules       # Firestore rules against the demo-project emulator
npm run test:callables   # callable Functions against the emulators
npm run test:booking     # booking/reschedule callables against the source SQL
npm run test:functions   # functions unit tests
npm run test:schedule    # schedule reader tests
npm run test:staff-access
npm run sql:compile      # compile Data Connect source → CJS/ESM/types
npm run sql:test         # SQL foundation tests
npm run test:migration   # local migration/reconciliation tests
npm run sql:release-check # source validation; not production certification
npm --prefix functions run lint
```

Auth model: Firebase Auth email/password. Staff roles are custom claims (`role` =
`admin` | `doctor` | `manager`; a doctor also carries `doctorId`). Patients are
authenticated users without a staff role. Time is Asia/Kolkata (IST, UTC+05:30, no DST);
store instants as Firestore `Timestamp` plus an IST `dateKey`.

## Deployment

Build first, then ship Hosting only:

```bash
cd Frontend && npm run build
NO_UPDATE_NOTIFIER=1 npx firebase-tools deploy --only hosting:public,hosting:staff --project sood-clinic
```

Hosting-only publishes nothing else. Rules, indexes, Functions and Data Connect each need
their own command and explicit approval. A `functions` deploy publishes every function
exported by `functions/index.js`, including ones no client calls yet.

Never commit service-account keys, Firebase CLI credentials, or `.env` files.

## Release gates

Verified production update, 2026-11-01: after explicit owner approval, the full
39-table SQL schema (including the nullable guest relation), `clinic` and
`clinic-admin` connectors were deployed. Automated backups and 7-day PITR were
verified enabled; backup 1793466000000 succeeded. This is not a restore rehearsal.
The public catalogue/settings import committed and verified 15 rows; its captured
source and before-image are in ignored `.local/sql-migration/`. The source release
check now exits 0 with no blockers and `productionApproved:false`.

The 20 booking/request functions using catalogue/settings were updated successfully
to SQL-only reads. Live public catalogue, consultation options and next-day slots
were verified; the staff request queue returned 403/PERMISSION_DENIED with no data
to an anonymous caller. This read cutover does not move appointment/request writes.
Verification in this session: SQL emulator suite 204 passed, migration suite 157
passed, booking/request suite 36 passed, callable suite 13 passed, with no skipped
cases in those runs. Both frontend bundles linted/built and functions lint passed.
`tests/run-emulator-tests.cjs` isolates callable tests in a temporary project with
dummy Calendar secrets so tests do not fetch real production credentials.

Staff privacy/workflow update, 2026-11-01: deployed `listStaffAppointments`,
`listConsultationRequests`, `bulkApproveConsultationRequests`,
`getVideoConsultationQueue`, staff Hosting, rules and the request pagination index.
Managers use a server-projected operational queue; raw appointment reads are denied.
They can coordinate video links, but neither appointment nor request responses expose
clinical intake. Conflicting batch requests remain pending with no decline event or
notification. Queues have scoped timestamp/document-ID pagination; Requests is linked
from each role dashboard. Verification: booking 39/39, callables 17/17, rules 16/16,
focused unit/service tests 9/9; no skips. Frontend lint/build and functions lint passed.
Live anonymous staff calls denied access; served staff bundles match the local build.
An authenticated production browser walkthrough has not been performed.

Schedule cutover, 2026-11-01: weekly hours and date exceptions now have one SQL
authority. Two admin operations were added (`ReadDoctorBookingHours`,
`CloseDoctorDay`), both connectors were redeployed, and the published schedule was
imported with `npm run sql:import-schedule -- --apply` (1 schedule state, 12 weekly
windows, 1 closed date). `getAvailability`, the `createBooking` preflight,
reschedule and `closeDay` read/write SQL; `closeDay` closes the date in SQL before
it resolves affected appointments, and a booking that commits during that race
withdraws itself. `get/saveSqlDoctorWeeklyHours` and `get/saveSqlDoctorSpecialHours`
are live for the doctor and admin schedule editors; `saveDoctorSchedule`,
`saveScheduleException` and the Firestore schedule readers are retired. App Check is
not enforced on these four callables because no site key is configured (matching the
editor they replace); live staff Auth/claims, the SQL revision check, receipt and
audit row remain the authority. Verified live: catalogue 200, `getAvailability` 200
with `scheduleConfigured: true` and 10 SQL slots, anonymous schedule/request calls
403, the retired callable 404. Backup `1793552400000` succeeded and PITR is on.

Full runtime migration remains incomplete: patient records, appointments, occupancy,
consultation requests/proposals and Calendar still use Firestore. The observed source census was 1 patient, 3 appointments, 2 requests and
1 exception, with no proposals, histories, documents or feedback. Recount before
importing. Schema deployment does not justify deleting these records or switching
their readers independently of writers. Explicit approval and verification remain
required for new production changes.

- `npm run sql:release-check` validates deployable connectors and the recorded guest
  policy. The approved source currently passes; never silence new blockers to ship.
  It does not certify deployed state or data migration.
- The full schema and production connectors are deployed. Patient, appointment/occupancy
  and consultation-request runtime cutovers still require a reviewed import and matching
  readers/writers; schedules and date exceptions are already SQL.
- Guest booking is enabled on the Firestore booking path only: `createBooking` requires a
  validated name plus phone or email, keeps `appointments.patientId` null, and records
  consent, per-caller throttling, idempotency and an audit row. No SQL guest write
  operation is connected to the public booking workflow yet.
- `Appointment.patient` is nullable locally and in production after the reviewed
  non-additive migration. Future DDL still requires diff and backup review.
- A newly created callable needs `roles/run.invoker` for `allUsers`. The CLI honours
  `invoker: 'public'` when it creates a service but ignores it on update, so re-check the
  binding after any redeploy that recreates a service.

## Reviews

Live (2026-11-02): `/reviews` (also `/experience`) and `/staff/reviews`.
Public/mobile navigation and completed-visit links lead to Reviews. Admin, Manager
and the separate Receptionist role can moderate; administrators assign Receptionist
through Staff Access. Receptionist has reviews/account access, not clinical or
appointment management access. All moderation uses live server-side role checks.

One review per owned completed appointment; authors can edit or withdraw it.
Explicit public-sharing consent is required before publication. Existing feedback
without consent remains private. All ratings are allowed. Public ratings/distribution
cover published reviews; clinic-selected highlights are labelled separately. Staff
can publish/hide/reject, reply, redact privacy details with a reason, resolve reports
and select highlight positions 1–6. Originals and versioned audit/history are retained;
staff cannot change a patient's rating. Developer highlights use existing consented,
published IDs in `FEATURED_REVIEW_IDS` in `functions/lib/reviews.js`.

These are independent clinic reviews, not a Google Reviews integration. No new paid
service or media storage was configured. Reviews deliberately extend the existing
Firestore `patientFeedback` store. Future SQL cutover must preserve consent, originals,
privacy edits, replies, versions, highlights, votes, reports and history; the legacy SQL
feedback table alone is not a replacement for this workflow. Browser reads/writes of
feedback, its subcollections and review quotas are denied; only projected callables
serve public data. Public/moderation queries are paginated; there is no polling.

Verified: callable emulator 26/26 (including 9 review scenarios), booking 39/39,
rules 17/17, review UI/session 11/11, staff lifecycle/authorization/directory 24/24,
patient-profile/link unit tests 11/11. Frontend lint/both builds and functions syntax
checks passed. Review, receptionist account and patient-only exclusion Functions,
indexes, rules and both Hosting sites deployed. Live public sorts/filters returned
200; private review endpoints denied anonymous callers. No synthetic reviews were
written to production. Authenticated moderation was exercised in emulators, not with
a real production staff account.

Additional checks exposed existing stale assertions: `Footer.test.jsx` still expects
asynchronous contact reads although Footer uses `clinicLocations`; three assertions
fail. `sqlPatientHandlers.test.js` expects deferred patient handlers to be exported;
one assertion fails. Neither implementation was changed to satisfy those unrelated
expectations, and those failures must not be reported as passing.

## Docs

- `AGENTS.md` — operating rules: golden rules, security, deploy protocol, release gates.
- `SQL/migration/README.md` — local migration and rehearsal tooling, and its limits.
