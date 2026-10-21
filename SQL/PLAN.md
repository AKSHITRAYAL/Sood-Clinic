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
13. Local synthetic transaction operations in `SQL/dataconnect/admin/rehearsal.gql` are UNDEPLOYED. Run `npm run sql:release-check` before any SQL release; current draft intentionally fails. Exclude the test operations and regenerate SDKs, and resolve the separate guest DDL/API review. Never silence a guard to deploy. The fixture-only driver is not a production importer; even a source-check pass is not release approval.

# Complete SQL backend plan

Status: implementation started 2026-10-19. Target: maximum managed Firebase functionality with portable relational data and controlled usage.

Progress reporting: `SQL/PROGRESS.md` tracks all phases and the rough weighted overall estimate. Include that breakdown in every final work report. Report local verification separately from production deployment.

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

Current execution: `SQL/phase 4.md`. The synthetic manifest/runner, catalogue target-ID reconciliation and normalized field projections are implemented. Local-only additions now include 13 catalogue columns, 11 Patient columns and one private PatientReportedProfile table (23 local tables; production remains 22). Patient identity/demographic/health candidates have no link grants or live API. Schedule source precedence/windows/exceptions have strict local assessment; conflicts, target storage/provenance and precision remain blocked. Continue P4-02b2 remaining lossless mappings; protected export/checkpoint/apply/restore is still pending. Candidate projections are not approved imports. No production patient export/import or backup activation has occurred.

Further P4-02b2 progress: strict booking configuration/service candidates and appointment/event target identity reconciliation now pass local tests. Ten more nullable local columns preserve service legacy identity/order/config creation, separate booking buffers/intervals/provenance and qualified event identity. Appointment service references resolve without inferring doctor offerings or historical prices. Known private fields, schedule storage/precision, remaining modules and protected importer/restore still need implementation. No runtime or production storage cutover accompanies these drafts.

Schedule storage draft now adds DoctorScheduleState plus ten nullable fields on existing window/exception tables (24 local tables, last deployed 22). Modern empty schedules have an explicit source-state row; weekly/exception windows retain source order and legacy IDs. Exception note/reason/provenance remain private. Pure candidate mapping reuses explicitly linked target IDs and checks date/parent identity, retaining conflict/precision/cutover blockers. Legacy clinic/embedded fallback sources still require reconciliation. No connector/runtime schedule cutover is included.

Appointment private-field draft adds AppointmentPrivateDetails and ordered AppointmentLegacySlot, plus 13 nullable appointment/event fields (26 local tables, last deployed 22). Snapshot/clinical reason, phone key, Calendar/video/cancellation state and source history now have typed private storage candidates. Expanded source shapes follow actual writers, including null video/public actor and reschedule fields. Guest bookings without a patient FK, missing evidence/action, exact precision, other retained modules and protected import/restore remain pending. No private API or live cutover is exposed.

Timestamp preservation draft adds private LegacySourceInstant (27 local tables, last deployed 22). A bounded preparation step encodes known timestamp fields into native SQL microseconds plus exact nine-digit source evidence, with tested reconstruction across the Firestore range. It preserves all prior blockers and adds an atomic-import requirement; intervals collapsing at native precision require review. Protected transaction/checksum/version/apply/restore work and the remaining retained-module/guest models are still pending. No live timestamp behavior or production schema was changed.

Guest relationship draft now retains the actual anonymous writer's explicit NULL patient and private contact snapshot without making identities/access links. Registered missing references and target NULL/non-NULL reassignment still fail closed. This is LOCAL ONLY: Appointment.patient nullability changes are not purely additive and cannot be included in the normal additive-only release. Review the exact DDL/API/FK deletion behavior and obtain explicit approval or redesign additively before any cloud application/deployment. No guest API/token or production change is enabled. Remaining retained-module mappings and importer/restore gates stay pending; see the current Phase 4 log.

Clinical preservation draft adds private LegacyMedicalHistory/LegacyMedicalDocument and candidate/target identity validation (29 local tables, last deployed 22). All known text/file metadata stays private, with explicit scope/visibility/storage/time/missing-evidence gates; missing doctor references are not invented. No finalized visit, link, download grant, file verification or Phase 7 workflow is implied. The count-only rehearsal and exact timestamp preparation include these candidates, still with zero writes. Feedback/audit/counter/request/ownership mappings and protected importer/restore remain pending. No current draft may bypass the guest relationship release stop above.

Feedback/audit preservation drafts now add LegacyPatientFeedback/LegacyAuditRecord (31 local tables, last deployed 22). Feedback continuity, moderation-state/evidence and unique appointment checks retain publication/consent gates; source published status never enables public output. Legacy audit actors/resources/typed metadata stay private and separate from trusted live AuditLog, with provenance/resource/deduplication/privacy review still pending. Exact timestamp preparation/count reports include both; no runtime API/import/release. Counters/booking requests/ownership reconciliation and protected importer/restore remain pending. Guest nullability still blocks automatic additive-only release.

Counter/request drafts add private LegacyUhidCounter/LegacyBookingRequest (33 local tables, last deployed 22). Exact decimal counter/max evidence flags collisions, behind/exhausted state and incomplete census without allocating/repairing UHIDs. Legacy retry records retain explicit appointment/reference/status history but cannot become active caller-scoped receipts; no verified caller binding is present. Target identity/timestamp checks and count reports are local only. Ownership reconciliation, protected importer/version/apply/restore and release gates remain pending; live allocator/booking APIs are unchanged.

Ownership review tooling now assesses explicit legacy UID/list/path claims against bounded synthetic Auth snapshots, flags ineligible/missing/ambiguous accounts and ALWAYS produces zero grants. It cannot approve self/guardian links, substitute contact matching or clear live-verification/clinic-evidence gates. Two nullable Patient author-provenance columns preserve actual staff createdBy objects alongside old strings; no runtime operation exposes them. Local tables remain 33, last deployed 22. Real-account reconciliation, protected importer/checkpoint/content/version/apply/restore and guest release review remain pending.

Protected inspection tooling now retains bounded encrypted source evidence and cumulative per-record blocked/rejected/excluded decisions with source/target/code binding. inspectAndSave executes existing mapping/ownership/timestamp validators against the whole batch, recomputes prior decisions on resume and returns count-only reports; low-level manual checkpoints do not themselves prove validation. Exclusive fsynced checkpoint publication never replaces an existing artifact; uncertain publication stays blocked for recovery. This is local synthetic inspection only, not a real exporter, independently anchored audit journal or SQL commit/import checkpoint. P4-03b remains partial; content/version/apply/restore and all release gates remain pending. See migration README and current execution log.

Offline drift comparison now accepts bounded encrypted full target-content snapshots with explicit table/key/version scope and compares them alongside source records. Count-only conflicts detect additions/removals/content/version/identity changes; unchanged snapshots still require census proof and an atomic version guard during the future write transaction. This does not provide a trusted exporter, candidate overwrite approval, live freshness or an importer. See protected-reader contract/limits before building the apply path.

Catalogue candidate/content reconciliation now compares explicit branch/department/doctor primary rows, membership keys and exact timestamp evidence against private snapshots. Content conflicts, unlinked key collisions, absent reused identities, missing scope and unaccounted target rows cannot become overwrite/delete/insert permissions. Other module comparisons, trusted producer/projection/census verification and all atomic import/restore gates remain pending.

Candidate content checks now reuse one fixed-contract routine for patient/private health profiles, clinical history/documents, appointments/events/private details/slots, feedback/audit, counters/requests, config/services and modern schedules/state/exceptions/windows, plus each scope's exact timestamp evidence. Patient ownership is reassessed without grants; per-row service/schedule identity decisions and singleton settings authority remain guarded. This covers existing pure projections only, not missing legacy evidence/authority, trusted extraction/census, atomic writes, restore or cutover.

Local transaction proof now uses one fixed inactive synthetic branch via guarded IAM operations to commit compare-and-set, exact timestamp evidence, audit and receipt atomically. Retry, concurrency, rollback and lost/uncertain response handling are tested. An encrypted logical before-image restores business state with a fresh version/audit; it is not a full database backup restore. P4-04/P4-05 remain partial, all real-source/ownership/backup gates remain and rehearsal.gql must never ship to production.

Read-only demo target capture now derives actual columns/composite keys and exact native timestamp strings for 23 declared domain tables in one consistent local snapshot, returning encrypted bytes/counts only. It refuses unsafe environment/key/type/size/census shapes and does not export Auth/security/live-audit state. Local source release-check deliberately blocks synthetic operations/SDKs and unreviewed guest nullability; no cloud call or release approval is provided. Real source/census, backup, ownership and production migration remain gated.

1. Map every live collection/subcollection and legacy ID to a SQL table/field; keep a unique `legacyId` where needed.
2. Build dry-run, bounded, restartable migration for catalog, users/profiles, patients/links, schedules, appointments/events, notifications/audit and document metadata.
3. Validate references, counts, nulls, timestamps, integer money, duplicate IDs and content checksums without exposing PHI.
4. Rehearse in local/test data; plan encrypted export/restore of production before cutover. Do not delete source records.

Exit: repeat run makes no duplicates; reconciliation report accounts for every record and rejected case.

## Phase 5 — Low-risk module cutovers

Execution: `SQL/phase 5.md`. The administrator public-contact editor is now implemented end-to-end locally using the existing SQL singleton, live Auth checks, optimistic concurrency, transactional audit/receipt and the existing public reader. Release is still held by the documented source/guest gates; no new schema or production contact write is included. User priority is now complete application features, not additional generic rehearsal tooling.

Catalogue administration is also now implemented locally: branch/department/doctor create/edit, ordered memberships, current administrator checks, versioned atomic audit/receipts, legacy-ID public/admin projection and coordinated availability/booking-selection readers. Actual catalogue census/import and reviewed source/column release remain required before any deployment; no real source record has been imported. Scheduling, visit formats, occupancy and appointments remain separate legacy workflows pending their phases.

Booking policy/service administration is subsequently implemented locally too: versioned global policy and single-format saves share an atomic revision/audit/receipt; all runtime publicConfig consumers now use SQL in the new source. Patient/public calendars and cancellation visibility consume published window/exact-minute cutoff without hard-coded fallbacks. Real settings/service reconciliation and the existing source/guest release gates remain required; schedules/occupancy/appointments/Calendar still retain their current stores. No production import or release occurred. See Phase 5 for the coordinated API/Hosting contract and rollback limits.

Switch in order: public profile/catalog → staff settings → patient profiles/links → admin audit. Each module requires service adapters, role tests, E2E checks and a documented rollback. Public content includes health guides/article/video metadata and consented review moderation; authoring migrations follow actual current storage. Never expose private author/staff data through public projections.

Linked-patient demographic service/SDK operations are now implemented locally with current verified Auth, explicit accepted self/guardian links, bounded selectors, private-field separation and version/link/account-locked audit/receipt saves. No callable/UI or legacy-access change accompanies this slice. Next integrate the remaining patient-facing consumers consistently before enabling those endpoints; retain source/identity/backup/guest release gates. See `SQL/phase 5.md`.

Local patient appointment history now supplies link-nested, current-Auth-scoped first/next/detail reads with twenty-row native-timestamp/unique-reference keyset pagination and operational-only projections. Private clinical/contact/video/Calendar/event fields remain excluded, malformed history fails closed, and no guest identity is adopted. This does not implement Phase 6 scheduler writes or enable a patient endpoint/UI. Continue coordinated patient consumers and release prerequisites; see `SQL/phase 5.md` for cursor/reschedule limitations.

Local self-reported health read/save now extends the patient service with current verified Auth and accepted self-link checks (not guardian clinical access). Blood group and private reported-health text save atomically with the shared demographic revision, account/link locks, audit and payload-bound receipt. Full explicit four-field input prevents accidental partial clearing. This is not a clinician record, patient UI/callable, source migration or production release; preserve all current cutover gates. See `SQL/phase 5.md` for privacy, field, retry and rollback contracts.

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
