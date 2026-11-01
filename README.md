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
npm run sql:release-check # MUST exit 1 today — see "Release gates"
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

Full runtime migration remains incomplete: patient records, appointments, occupancy,
consultation requests/proposals, schedule exceptions and Calendar still use
Firestore. The observed source census was 1 patient, 3 appointments, 2 requests and
1 exception, with no proposals, histories, documents or feedback. Recount before
importing. Schema deployment does not justify deleting these records or switching
their readers independently of writers. The older gate descriptions below describe
the pre-release state; explicit approval and verification remain required for new
production changes.

- `npm run sql:release-check` currently exits 1 **by design**
  (`SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT`, `SYNTHETIC_REHEARSAL_SDK_PRESENT`,
  `GUEST_RELATION_RELEASE_REVIEW_REQUIRED`). It is a safety stop, not a failing test.
  Never silence it to make a deployment green.
- The local SQL schema is ahead of the deployed one. The catalogue, patient, schedule,
  appointment and scheduler-hold additions are local-only until the guest-relation
  DDL/API review, a verified backup, and a real import path exist.
- Guest booking is enabled on the Firestore booking path only: `createBooking` requires a
  validated name plus phone or email, keeps `appointments.patientId` null, and records
  consent, per-caller throttling, idempotency and an audit row. No SQL guest write
  operation exists, and this does not clear `GUEST_RELATION_RELEASE_REVIEW_REQUIRED`.
- `Appointment.patient` is nullable locally but not in production, so the SQL migration is
  **not** purely additive. Do not apply it under an additive-only rule.
- A newly created callable needs `roles/run.invoker` for `allUsers`. The CLI honours
  `invoker: 'public'` when it creates a service but ignores it on update, so re-check the
  binding after any redeploy that recreates a service.

## Docs

- `AGENTS.md` — operating rules: golden rules, security, deploy protocol, release gates.
- `SQL/migration/README.md` — local migration and rehearsal tooling, and its limits.
