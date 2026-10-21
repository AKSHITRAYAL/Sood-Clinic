# Sood Clinic — AI handover

## Read this first

Work only in `/home/keshu/Projects/hospital-management-system`. Read `AGENTS.md`, `SQL/PLAN.md`, `SQL/PROGRESS.md`, and the relevant phase log before editing. Preserve unrelated working-tree changes. Do not reset, checkout, stash, or broadly delete files.

This is healthcare software. Keep browser code untrusted, Firebase Auth/custom claims authoritative, clinic time in `Asia/Kolkata`, and patient identity separate from Auth UID. Never expose PHI or credentials. Passwords remain eight characters with uppercase, lowercase, digit, and any special symbol; SMS MFA is deferred.

## Operating mode

- Build code first; do not run the full test suite unless the user explicitly asks for verification.
- The separate testing AI owns all test files and `SQL/TEST-RESULTS.md`. Do not overwrite its results.
- Add/update only concise test specifications in `SQL/TEST-QUEUE.md`.
- Run only local syntax, targeted lint, `git diff --check`, and `npm run sql:compile` when connector sources change.
- Never use production data, deploy, migrate, create Cloud SQL resources, enable paid providers, send SMS/email, or add dependencies without explicit approval.
- `npm run sql:release-check` is expected to fail until its documented blockers are resolved. Never bypass it.

## Current state (2026-10-20)

Branch: `main`. The working tree is intentionally dirty with earlier implementation and test-AI changes; preserve them.

Firebase project: `sood-clinic`; SQL Connect service: `ak-sood-clinic-service`; region: `asia-south1`; existing Cloud SQL instance/database: `ak-sood-clinic-instance` / `ak-sood-clinic-database`.

Implemented locally but not fully verified or cut over: contact/catalogue/booking policy, patient demographics/health/history/linking, clinic-day reads, weekly hours, special hours, and public doctor-hours projection. New SQL code is intentionally unmounted/unexported unless a phase explicitly says otherwise. Firestore remains authoritative for production patient/appointment workflows until coordinated cutover.

Latest implementation:

- `SQL/dataconnect/clinic/queries.gql`: public `GetPublicDoctorHours` read-only projection.
- `Frontend/src/services/publicScheduleService.js`: strict date/weekday/IST/window validation and exception precedence; no Firestore fallback.
- Generated clinic SDK under `SQL/generated/clinic/` via local compile.
- B014 specification in `SQL/TEST-QUEUE.md`; behavior testing is delegated.

Local checks for that change: SQL compiler passed; targeted frontend ESLint passed. Generated README whitespace is compiler output; do not hand-edit generated SDKs.

## Progress estimate

Phase 0 80%, Phase 1 100%, Phase 2 100%, Phase 3 90%, Phase 4 89%, Phase 5 52%, Phase 6 0%, Phase 7 0%, Phase 8 5%; overall approximately 61%. These are scope estimates, not test or production-readiness claims.

## Next work, in order

1. Continue Phase 5 with concrete user-facing SQL modules, keeping them unmounted until coordinated cutover gates are satisfied.
2. Finish patient UI/callable integration only as a coordinated slice; preserve App Check, live Auth, explicit links, bounded queries, retries, and no legacy fallback.
3. Do not start scheduler writes until Phase 6: inspect scheduler branch logic, then implement atomic interval/hold/occupancy/booking/cancel/reschedule/event behavior together. Never use one-document-per-start-time locking.
4. Keep documents/clinical/financial/media work in Phase 7; Storage holds bytes and SQL holds protected metadata.
5. Before any SQL release, run the release guard and obtain review for guest nullability, synthetic rehearsal operations/SDKs, imports, backups, and restore/rollback.

## Safe handoff commands

```bash
cd /home/keshu/Projects/hospital-management-system
git status --short --branch
npm run sql:compile
cd Frontend && node_modules/.bin/eslint src/services/<changed-file>.js
cd .. && git diff --check
```

Do not claim deployment or tests from compilation. Report every phase percentage in every update, and end each report with what was not checked and the remaining risk.
