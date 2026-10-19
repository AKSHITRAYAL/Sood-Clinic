# Instructions for every AI CLI — read before editing

1. Read repository `AGENTS.md`, this file, then `SQL/phase 1.md`. Run `git status --short --branch` first. Preserve other agents' edits. Work in `/home/keshu/Projects/hospital-management-system`.
2. This is the user-approved SQL migration plan. It supersedes Firestore-specific storage choices in `files/03-target-architecture.md` only for the new SQL backend. Existing production features continue using Firestore until their tested cutover.
3. Read the current phase log (`SQL/phase 4.md` at present, with security handoff in `SQL/phase 3.md`), then finish the earliest unchecked step. Change only its files. Record exact commands, results, blockers and next step in the phase execution log. Never mark a task done from a file's existence alone.
4. Use existing Firebase SQL Connect (CLI calls it `dataconnect`) and its generated SDKs. Schema source is `SQL/dataconnect/schema/`; connector operations are the API. Do not add Express, an ORM, a generic repository framework or a second database migration system.
5. Firebase custom claims remain authoritative for staff roles. SQL profiles do not grant roles. Auth UID identifies an account; patient ID identifies a person. A family account can link several patients after verified authorization.
6. Default deny: explicitly authorize each connector operation. Private data has no public query. Privileged writes require validation, trusted authorization and audit in the same transaction. Never put passwords, tokens, credentials or patient exports in tracked files/logs.
7. `npm run sql:compile` uses the installed Firebase local compiler without fetching remote sources. Test only with project `demo-sood-clinic` locally. Never use production for load tests, fixtures, or reset commands. An emulator success is not a production deployment.
8. Do not run `firebase init`, `dataconnect:sql:setup`, `--force`, destructive SQL, broad `firebase deploy`, or create/resize Cloud SQL/staging/backups/services as a routine step. Review migration SQL before applying it. Use `COMPATIBLE` mode; preserve unmodeled tables.
9. User authorizes verified website deployments. Build both sites first; deploy only `hosting:public,hosting:staff`. SQL releases are separate and require a reviewed, additive diff against the verified existing instance. Never claim Hosting deployed the SQL schema.
10. No scheduler-branch merge during this foundation phase. Preserve its reusable pure logic and tests for Phase 6. No permanent dual writes. Every entity has exactly one authoritative store at cutover.
11. Keep patient/manager/doctor/admin permission tests, server time, money in integer paise, bounded queries and error handling. Respect the user's current eight-character password policy and deferred SMS MFA.
12. Never claim free operation or a hard spending cap: Cloud SQL has running costs; a ₹25 budget alert does not stop billing. Reuse the existing instance, use emulators and batch deployments. Ask before a new recurring paid service is needed.

# Complete SQL backend plan

Status: implementation started 2026-10-19. Target: maximum managed Firebase functionality with portable relational data and controlled usage.

## Architecture and verified starting point

Firebase Hosting serves public/staff React apps. Firebase Auth supplies identities and trusted staff claims. SQL Connect compiles GraphQL schema into PostgreSQL, deploys predefined authorized operations, and generates typed client/Admin SDKs. React calls these through feature services. Functions remain for Auth administration, secrets, email/Calendar integration and workflows that cannot be safely expressed in connector transactions. Storage holds file bytes; SQL holds protected metadata. SQL does not store video blobs.

Verified with authenticated read-only CLI/API on 2026-10-19:

- Project `sood-clinic`; service `ak-sood-clinic-service`; region `asia-south1`.
- Existing instance identifier `ak-sood-clinic-instance`; database `ak-sood-clinic-database`.
- Initial service had zero deployed connectors and empty schema; Phase 2 has now deployed the schema and `clinic`/`clinic-admin` connectors (20 tables, including scoped-operation receipts).
- Initial SQL Connect schema API reported `ephemeral: true`; Cloud SQL Admin API confirmed the existing instance is `RUNNABLE`, PostgreSQL 18, `db-f1-micro`, zonal, 10 GB, Mumbai. Automatic backups remain disabled. The CLI preview finalized binding to that instance (`public` schema). Phase 2 applied 60 reviewed additive statements and deployed schema/connectors; the post-release required diff is empty. See phase logs for evidence.
- `main` is `106415eb` at start. Working tree was clean. Production application's data access is Firestore/Functions.

## Phase 0 — Boundary and inventory

- [x] Verify existing service identity and source using authenticated reads.
- [x] Preserve Firestore production access and authoritative custom claims.
- [x] Select generated SQL Connect schema/SDKs as primary managed path.
- [x] Verify durable instance/database and review additive changes before SQL release. Existing instance has `nt` label, `PER_USE` pricing, and was reused without resizing; do not claim trial entitlement or zero cost.
- [ ] Exact baseline monthly bill/trial entitlement remains a billing-console check; no new recurring service was enabled in the foundation release.

## Phase 1 — Relational foundation (complete; see execution log)

Deliver versioned schema, connector configuration, local seed fixtures, compiler and SDK generation, PostgreSQL integrity tests and local operation/security tests. Include account/staff/patient linking, clinic/branch/department/doctor/service catalog, settings, weekly windows/exceptions, appointment/event structure, notification outbox and audit structure. Appointment structure is a foundation only; booking algorithms come in Phase 6. See `phase 1.md` for the runnable checklist and evidence.

Exit: reproducible local database; idempotent fixtures; foreign keys/uniqueness and authorization tested; compile and website regression checks pass. Production readiness is a separate tracked gate.

## Phase 2 — Safe application operations (first milestone complete and live)

Execution evidence: `SQL/phase 2.md`. Includes deployed schema/connectors, verified-account mutation and first SQL-backed Contact page. This is not completion of every later backend module.

1. Generate browser and Admin SDKs; feature services preserve current UI contracts.
2. Add verified-account profile operations, strict validation/error codes and bounded pagination.
3. Add transactionally coupled audit/idempotency for privileged operations. Use connector transactions when supported; use a minimal Function only where required.
4. Test failing validation, duplicate requests, rollback and safe errors. No global SQL connection pool is needed merely to call SQL Connect.

Exit: one complete authenticated workflow with negative security tests; no production routing switched until ready.

## Phase 3 — Identity and staff administration

Execution: `SQL/phase 3.md`. Staff directory/lifecycle/audit use SQL with live Auth checks; shared staff gates and doctor-scope enforcement are deployed. P3-07d's clinic-issued, account-bound, single-use linking-code service is implemented and tested locally; its invitation table brings the schema to 22 tables. Patient linking has no callable/UI yet and does not authorize legacy Firestore records. Direct Firestore tokens still obey token expiry rather than universal immediate revocation. These milestones are not full patient identity/storage cutover.

1. Firebase UID maps to `User`; SQL staff profile is a projection of trusted claims.
2. Enforce active account, role, doctor scope and forced password completion at every applicable operation.
3. Reuse Auth staff-management guards (last admin, self-lockout, revocation). Test role removal with old sessions.
4. Link patient records only with verified clinic-issued evidence; never auto-link by knowing a phone/email.

Exit: anonymous, cross-patient, manager-clinical and wrong-doctor requests are rejected; no browser role escalation.

## Phase 4 — Data migration rehearsal

Current execution: `SQL/phase 4.md`. The 25-category synthetic manifest, pure catalogue/UUID candidates and a fixture-only count-report runner are implemented. Next is P4-02b: existing target-ID reconciliation and lossless mappings/validators; the export/checkpoint/apply/restore runner remains pending. Candidate projections are not approved imports. No production patient export/import or backup activation has occurred.

1. Map every live collection/subcollection and legacy ID to a SQL table/field; keep a unique `legacyId` where needed.
2. Build dry-run, bounded, restartable migration for catalog, users/profiles, patients/links, schedules, appointments/events, notifications/audit and document metadata.
3. Validate references, counts, nulls, timestamps, integer money, duplicate IDs and content checksums without exposing PHI.
4. Rehearse in local/test data; plan encrypted export/restore of production before cutover. Do not delete source records.

Exit: repeat run makes no duplicates; reconciliation report accounts for every record and rejected case.

## Phase 5 — Low-risk module cutovers

Switch in order: public profile/catalog → staff settings → patient profiles/links → admin audit. Each module requires service adapters, role tests, E2E checks and a documented rollback. Public content includes health guides/article/video metadata and consented review moderation; authoring migrations follow actual current storage. Never expose private author/staff data through public projections.

Exit: cut-over modules read/write SQL exclusively; no silent fallback can hide SQL failure or split writes.

## Phase 6 — Scheduler and clinic day

Inspect the scheduler worktree itself, including uncommitted work. Port pure availability, IST handling, validation and state-machine tests. Implement SQL atomic holds/occupancy, concurrency constraints, cancellation/reschedule, events, guest access tokens, queue counters, idempotency and audit together. Review full interval/buffer conflicts, expiry and Calendar integration. Test simultaneous booking and rollback before switching public/manager/doctor/patient clients together.

Exit: exactly one booking succeeds for a conflicting interval under concurrency; retries are safe; no PHI in public availability.

## Phase 7 — Clinical, financial and media modules

Add visits and finalized notes/addenda, prescriptions, protected document metadata/download authorization, invoices/items/payments/refunds, reports and consent/export/retention workflows incrementally. Use relations and integer paise. File bytes remain in Storage; video calls use a suitable integration. Outbox workers deliver confirmations and reminders with retries and unique dedupe keys. Defer paid providers until explicitly configured and budgeted.

Exit: doctor/patient clinical scope, invoice arithmetic and payment idempotency tested; provider costs documented.

## Phase 8 — Production cutover and operation

1. Validate durable datasource and reviewed additive migration diff; apply schema and connectors independently of Hosting.
2. Reconcile final data under a controlled write freeze; switch tested modules together; smoke-test real domains/Auth/App Check.
3. CI runs compile, meaningful schema/security/integration tests, lint and both builds. Production deployment uses controlled identity and explicit targets.
4. Observe errors/latency/SQL resources and billing; document backups/PITR/restore settings and actual charges before enabling paid extras.
5. Keep a tested rollback and protected source export for the agreed window. Remove Firestore callers/indexes/triggers only after that window; delete or scale down unused resources deliberately.

Exit: production uses SQL for migrated records, tested restore/rollback exists, unused Firebase usage is retired and costs are understood.

## Cost and portability rules

- Reuse one current Cloud SQL instance; local emulator for development. No second cloud environment without an estimate/approval.
- Query only required fields with limits and appropriate indexes; cache public catalog; no polling full tables or patient collections.
- Cloud SQL compute/storage/backups, SQL Connect operations/egress, Functions, Storage and Hosting are separate meters. Budget alerts notify; they do not cap spending.
- Use UUIDs for new entities; Auth UID remains a string; preserve legacy IDs. Use join tables instead of identity arrays. Instants use `Timestamp`; clinic dates use `Date`, wall-clock windows use minute-of-day plus clinic timezone.
- Source-controlled `.gql` schema is the migration authority. Preserve/review compiler-produced SQL. Add custom PostgreSQL constraints only through a documented supported path and test subsequent SQL Connect diffs; never assume all SQL features are exposed by GraphQL.

## Official references checked 2026-10-19

- https://firebase.google.com/docs/sql-connect/configuration-reference
- https://firebase.google.com/docs/sql-connect/schemas-guide
- https://firebase.google.com/docs/sql-connect/authorization-and-security
- https://firebase.google.com/docs/sql-connect/manage-schemas-and-connectors
