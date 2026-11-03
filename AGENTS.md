# AGENTS.md — Sood Clinic

> Entry point for any AI coding agent (Claude Code reads `CLAUDE.md`: copy this file to
> `CLAUDE.md` or add `@AGENTS.md` inside it). Read it fully, then read only what your task
> needs. Commands, structure and release gates are duplicated in `README.md`.

## 1. What this project is

A **real-client** clinic website and management system for **Sood Clinic, Panchkula**
(single doctor today: Dr. Brig. A. K. Sood VSM (Retd), gastroenterology; House No. 398,
Sector 10, Panchkula, Haryana 134109). A public website (marketing, booking, patient
portal) and a staff website (admin, doctor, manager), both served from one Firebase project
(`sood-clinic`) on one billing account.

- Repo branch `main`. Live: `https://sood-clinic.web.app` (public),
  `https://sood-clinic-staff.web.app` (staff).

## 2. Stack and layout

| Path | What |
|---|---|
| `Frontend/` | React 18 + Vite + Tailwind SPA. Two entries build separate bundles: `src/entry/public.jsx` → `dist/public`, `src/entry/staff.jsx` → `dist/staff`. All CSS is hand-written in `src/index.css`. |
| `functions/` | Firebase Functions (Node 22, `asia-south1`) exported from `functions/index.js`: booking/availability, staff lifecycle, catalogue/contact/policy, calendar, feedback, video and SQL staff directory. Scheduler hold adapters are staged, not exported. Shared code in `functions/lib`. |
| `firestore.rules`, `firestore.indexes.json` | Access control and indexes. |
| `firebase.json`, `.firebaserc` | Hosting (two sites: targets `public` and `staff`), Firestore, Functions, Data Connect, emulators. |
| `SQL/dataconnect/` | SQL Connect schema, connectors and admin operations. |
| `SQL/generated/`, `functions/generated/sql/` | Committed generated SDKs (CJS/ESM/types). Regenerate with `npm run sql:compile`; never hand-edit. |
| `SQL/scripts/` | `compile`, `test`, `rehearse`, `release-check`, local emulator and branch-rehearsal helpers. |
| `SQL/migration/` | Local migration/reconciliation tooling and fixture rehearsal — see `SQL/migration/README.md`. |
| `tests/` | Rules, callable, booking, schedule, time and staff-access suites. |

Auth model: Firebase Auth email/password. Staff roles are **custom claims** (`role` =
`admin` | `doctor` | `manager` | `receptionist`; a doctor also carries `doctorId`).
Receptionist is a separate reviews/account role: it is explicitly excluded from
the default operational/clinical `requireLiveStaff` allow-list. Only review moderation
and session/account handlers opt it in. Never alias it to manager.
Patients are any
authenticated user without a staff role.

## 3. Commands

```bash
cd Frontend && npm ci && npm run lint && npm run build   # both bundles
cd ..
npm run test:rules        # Firestore rules, demo-project emulator
npm run test:callables    # callable Functions, emulators
npm run test:booking      # booking/reschedule callables against source SQL
npm run test:functions    # functions unit tests
npm run test:time         # IST helper tests
npm run sql:compile       # Data Connect → generated SDKs
npm run sql:test          # SQL foundation tests
npm run test:migration    # local migration/reconciliation tests
npm run sql:release-check # source validation; not production certification, see §6
npm --prefix functions run lint
```

Deploy Hosting only (build first):
`NO_UPDATE_NOTIFIER=1 npx firebase-tools deploy --only hosting:public,hosting:staff --project sood-clinic`.
It ships **Hosting only** — rules, indexes, functions and Data Connect are not deployed by
it and need explicit approval.

## 4. Golden rules (do not break these)

1. **Never trust the browser.** Anything that changes appointments, slots, roles, money or
   clinical data must be validated server-side (callable or tightly constrained rules).
   Clients must not write `appointments` / `appointmentSlots` directly.
2. **Roles come only from custom claims** set by the Admin SDK. Never derive a role from
   Firestore data the client can write, from `localStorage`, or from the URL.
3. **Least privilege.** Manager ≠ doctor. Clinical data (visit notes, history, documents,
   prescriptions) is doctor-only, plus the owning patient where stated. Do not widen a rule
   to "make the UI work"; fix the query or the design.
4. **Time is Asia/Kolkata (IST, UTC+05:30, no DST).** Store instants as Firestore
   `Timestamp`, plus a `dateKey` (`YYYY-MM-DD`, IST) for day queries. Never use local `Date`
   getters for business logic — Functions run in UTC. Use the shared IST helper.
5. **Firestore has no nested arrays.** Store windows as `[{ start: "08:00", end: "10:00" }]`.
6. **No secrets in the repo.** Firebase web config is public by design; service-account
   keys, `.env` and tokens are not. Do not weaken `.gitignore`.
7. **Keep rules, indexes, functions and UI in sync.** A new query needs its index; a new
   collection needs a rule and a rules test. Deploy them together.
8. **PHI.** Never log patient names, phones or clinical text to `console`, Analytics or
   Function logs. No third-party scripts on staff or patient pages.
9. **Do not change data shapes silently.** A shape change needs a migration when production
   data exists, plus updated rules and tests.
10. **Do not mix UI redesign with logic work.** Keep presentation and logic separable.

## 5. How to work

1. Make small, reviewable changes; one task per commit.
2. For rules or backend changes, write the failing emulator/rules test first.
3. Before finishing: `npm --prefix Frontend run lint`, `npm --prefix Frontend run build`,
   `npm --prefix functions run lint`, and the suites your change touches. Tests for the SQL
   migration and scheduler backends are scheduled through the test tooling in `SQL/tests`;
   never claim a check you did not run.
4. Fix the cause of a failing check. Do not skip tests, weaken assertions, swallow errors or
   add suppressions to make verification pass.
5. Flag what you cannot verify from the repo (see §7) instead of assuming it.
6. Do not add documentation files. Explain non-obvious decisions in a code comment or the
   commit message.

## 6. Release gates (binding)

Verified release-state note (2026-11-01): the owner explicitly approved and this
session deployed the full 39-table schema and the two production connectors.
The reviewed public catalogue/settings import succeeded. `SQL/release/plan.json`
contains the DDL/backup evidence; `README.md` records the remaining Firestore
runtime domains. All authorization, backup, testing and new-release approval requirements
continue to apply. A source-check pass still does not certify production readiness.

- `npm run sql:release-check` validates local sources only. The approved source currently
  passes; never exclude a guard or silence new blockers to ship. A source-check pass
  is not release approval or proof of deployed state.
- Do not deploy any SQL/Data Connect addition until the guest-relation DDL/API review, a
  verified backup/restore path, the clinic evidence gates and a reviewed real import exist.
  Never deploy just an editor or writer, and never deploy a new scheduler backend alone.
- `Appointment.patient` is nullable locally and in production after the reviewed
  non-additive migration. Future DDL still requires diff and backup review.
- Weekly hours and date exceptions are SQL-only (2026-11-01): `ReadDoctorBookingHours`
  and `CloseDoctorDay` back `getAvailability`, `createBooking`, `closeDay` and the live
  `get/saveSqlDoctorWeeklyHours` / `get/saveSqlDoctorSpecialHours` callables. The legacy
  `saveDoctorSchedule`/`saveScheduleException` writers are deleted; do not reintroduce a
  Firestore schedule reader or writer. Appointments, occupancy, requests and Calendar
  writes are still Firestore.
- `holdAppointment` was deleted with the other undeclared callables. Its adapter modules
  are staged; do not claim a live SQL booking/occupancy workflow from them.
- A newly created callable gets no `allUsers` invoker binding on **update**. The CLI honours
  `invoker: 'public'` on create only, so re-check the IAM binding after any redeploy that
  recreates a service.
- No production mutation, import, seed, migration, deploy of rules/indexes/functions, or new
  paid resource without explicit approval.
- Preserve uncommitted work from other agents; if ownership of a file is uncertain, leave it
  and report it.

## 7. Things you cannot verify from the repo

Flag these, do not assume: the Firebase billing plan (Spark vs Blaze), Firestore region,
whether rules/functions/indexes/connectors are deployed and match the repo, whether any
production appointment or patient data exists, whether App Check / API-key restrictions are
configured, and the clinic's real phone/email/fee schedule.

## 8. Further reading

- `README.md` — structure, commands, deploy and release gates.
- `SQL/migration/README.md` — migration/rehearsal tooling, its exact limits and why it is
  not an importer.
