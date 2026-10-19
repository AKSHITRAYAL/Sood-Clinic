# Instructions for AI CLIs — read before executing

1. Read `AGENTS.md`, `SQL/PLAN.md`, and `SQL/phase 3.md`. Preserve all dirty files. Work only in `/home/keshu/Projects/hospital-management-system`.
2. This phase is migration rehearsal, not production cutover. No real patient export/import, write freeze, source deletion, backup activation or provisioning without the documented release gate. Use only synthetic local fixtures in `demo-sood-clinic` for development.
3. Never infer patient ownership from a matching name, phone, email, document ID or appointment ID. Legacy ownership needs verified provenance and an explicit reviewed mapping. `Patient.id` and Firebase Auth UID are different identifiers.
4. Never put production records, identifying filenames, credentials, codes, hashes of contact details or health text into tracked files, logs or terminal output. Reports contain counts/reason codes, not row values. Input/temporary production exports, if later authorized, must be encrypted and access-controlled outside Git.
5. Use SQL Connect schema/operations and generated SDKs; no ORM or second migration system. Run `npm run sql:compile`, `npm run sql:test`, Functions/frontend lint and both builds. Production schema changes require a reviewed additive diff; no `--force`, STRICT or broad deployment.
6. Keep exactly one authoritative store per workflow. Do not wire new links into the patient portal before its profiles, appointments and document authorization switch together. The new linking service has no exported callable or UI yet, deliberately.
7. Complete the earliest unchecked task. Record exact commands/results below. A source-code inventory is not evidence of actual production collections, counts, consent or recoverability. Do not claim a migration or restore succeeded without its checks.

# Phase 4 — bounded, restartable migration rehearsal

## Ordered checklist

- [x] P4-01a: inventory storage references in source and identify lossy/ambiguous mappings below. No production records inspected or exported.
- [x] P4-01b: implement a synthetic fixture manifest covering every inventoried source category, including unknown subcollections/fields; reject unaccounted fields instead of silently dropping them. Recognition is not approval to import.
- [x] P4-02a: implement/test pure new-entity UUID candidates and branch/department/doctor candidate projections with explicit dependencies, private complete source envelopes and no apply readiness.
- [ ] P4-02b: finish lossless per-field mappings and semantic validators for all retained modules; reconcile existing SQL IDs by legacyId before deriving new ones. Add missing schema fields/legacy IDs through reviewed additive changes; never discard known unmapped fields.
- [x] P4-03a: implement a built-in-synthetic-only dry-run runner with bounded in-memory pages, counts/reason codes and no writes. Refuse cloud project/database settings and arbitrary input/apply arguments.
- [ ] P4-03b: add a protected local export-reader/checkpoint contract, bounded restartable processing, private per-record reconciliation and content checksums. The fixture-only runner is not this importer and has no checkpoint/apply path.
- [ ] P4-04: implement local repeat-run apply/reconciliation via IAM operations; test idempotency, missing references, duplicate UHIDs, integer money, timezones, invalid dates, unknown statuses and rollback on failure. Reject ambiguous ownership for manual review.
- [ ] P4-05: demonstrate local restore/rollback with synthetic data; document encrypted source snapshot and verified restore requirements for real cutover. Do not enable paid backups automatically.
- [ ] P4-06: obtain/verify production backup/restore policy and a protected source snapshot before any real patient migration. Exact Cloud SQL charges/trial entitlement remain a billing-console check.
- [ ] P4-07: prepare a bounded production dry-run/reconciliation plan; actual execution is gated by P4-06 and explicit reviewed scope. Keep legacy stores authoritative until Phase 5/6 cutovers.

## Source inventory and mapping gaps

Verified by `rg` against `functions/index.js`, `Frontend/src`, and Firestore rules on 2026-10-19. This is a source inventory, not a database census.

| Source | Target / disposition | Required checks before cutover |
|---|---|---|
| Firebase Auth accounts/custom claims | `User`, rebuildable `StaffProfile` | Auth stays authoritative; no password hashes or role grants migrated to SQL. Account profile and patient identity are separate. |
| `clinic/publicConfig` | published `ClinicProfile`, private `ClinicSettings`, `Service` | Contact is already SQL-backed. Split public/private settings; visit-type codes, fees, modes and doctor offerings need explicit mapping. Do not overwrite SQL contact from stale Firestore. |
| `branches`, `departments`, `doctors` | `Branch`, `Department`, `Doctor`, join tables | Preserve legacy IDs; validate branch/department references and doctor claims' legacy-ID mapping. Do not derive public/active flags from missing values. |
| `patients` | `Patient` plus later protected clinical/profile fields | Current schema does not yet preserve title, marital status, structured address, emergency contacts or all profile fields. Allergies/current medications/health notes are clinical, not manager-visible demographics. Add tested storage/authorization before migration; never discard them. |
| `patients/{id}` ownership / `linkedUids` | reviewed `PatientLink` mapping | UID-shaped IDs are not proof of ownership. Validate provenance, exclude staff identities, flag stale/deleted users and ambiguous legacy links. New links use clinic evidence and patient acceptance, never matching contact data. |
| `patientDirectory` | rebuild from authoritative SQL demographics/links | Derived search projection; not a second patient identity source. Current legacy searches use normalized contact/name keys; SQL search design must preserve bounded access. |
| `patientIdentityLocks`, `counters/patientUhid` | reconciliation metadata / future unique UHID allocation | Preserve UHIDs and validate duplicates/max sequence. Locks are not patients and must not become access grants. Do not rerun the old role migration/seed scripts. |
| `doctorSchedules`, `scheduleExceptions`, old `clinicSchedules` fallback | `DoctorSchedule`, `ScheduleException`, `ExceptionWindow` | Inspect actual fields; preserve IST weekday/window semantics. Distinguish closed/extra/replacement days. Retire old fallback only after scheduler cutover. |
| `appointments`, nested `events` | `Appointment`, `AppointmentEvent`, later clinical/guest-access fields | Map exact status/visit type/patient/doctor/branch/department references; current schema is foundation, not full scheduler. Preserve snapshots, Calendar/video state and cancellation/reschedule provenance. Never infer missing patient ownership from snapshots. |
| `appointmentSlots`, `bookingRequests` | future SQL occupancy/idempotency contracts | Rebuild conflict protection from authoritative appointments under scheduler cutover. Do not blindly import one-start-time locks as interval protection. Phase 6 owns this. |
| `patients/{id}/medicalDocuments`, legacy medical history | later protected document/clinical tables | Storage bytes remain in Storage. Validate doctor ownership, patient visibility, metadata and protected download policy. No clinical tables or file-content migration is implemented yet. |
| `patientFeedback` | later consent/moderation tables | Preserve consent, moderation state, timestamps and source appointment without publishing private author metadata. Never fabricate past reviews. |
| `auditLogs` | bounded legacy history + `AuditLog` | Existing reader already combines legacy and SQL staff events. Map action/resource/actor/time explicitly and avoid duplicate import. No raw clinical metadata copied. |
| retired `staffProfiles` | do not import as authority | Runtime staff lifecycle already uses SQL; legacy projection is stale and browser reads are denied. |
| `rateLimits` | existing server limiter until replacement | Ephemeral security state, not business records; preserve effective abuse controls during cutover. |
| `integrations/googleCalendar`, `integrationOAuthStates` | keep protected existing integration path | Refresh credentials stay in existing protected storage/Secret Manager, never patient SQL or migration reports. OAuth states are temporary authorization grants, not business data. |
| Health-guide articles/videos and public assets | current source/static content; later SQL metadata where needed | Inspect actual content sources before inventing a collection. Video/file bytes never go into SQL. No new streaming provider enabled. |

## Mapping rules for the next CLI

1. Inventory every source field recursively in synthetic fixtures. Maintain an explicit allow-list and report unknown fields/collections as rejected categories, not printed content.
2. Define deterministic namespaced UUID mapping per entity kind (not one shared hash namespace), with test vectors. Persist/check legacy identifiers and foreign-key mappings. Never derive UUIDs from names/phones/emails.
3. Validate dates as real calendar dates, timestamps as instants, money as integer paise and finite nonnegative values. Preserve IST business-day semantics; never round float rupees silently.
4. Separate `rejected` from `pending dependency` from `already applied`. Checkpoint only after a committed batch. Repeat runs must not duplicate rows/audits or reset authoritative SQL updates.
5. Account for every source category, even when deliberately excluded as ephemeral/secret/derived. Count/checksum reports must explain exclusions and unresolved records without PHI.
6. A successful SQL link does not authorize a legacy Firestore patient record. During the transition there is no dual-authority fallback; no linking callable is exposed yet. Phase 5 must switch reads and mutations together with negative authorization tests and a rollback plan.
7. Restoring real clinical data and choosing backup retention/RPO/RTO require the clinic's decision. Continue all safe local mapper/rehearsal work first; do not treat an unverified backup as protection.

## Execution log — 2026-10-19

1. Continued from P3-07d's clinic-code linking implementation. Source scan confirms the legacy patient portal still reads `patients/{auth.uid}`, its document subcollection and appointments filtered by `patientId == auth.uid`. No client uses the new SQL links yet; changing only one query would split authorization/data ownership.
2. Identified explicit schema gaps above before writing an importer. No live data read/export/import, patient identity reassignment, scheduler merge or paid feature activation. Next task: P4-01b synthetic manifest and lossless mapping checks, then the bounded local-only runner.
3. Wrote failing `SQL/tests/migration.test.cjs`, then added `SQL/migration/manifest.cjs`, `fixtures.cjs`, `rehearsal.cjs` and the fixed-fixture CLI `SQL/scripts/rehearse.cjs`. All 25 inventoried categories have synthetic examples; exact nested leaf allow-lists reject unknown fields/subcollections instead of dropping them. A source-code collection-reference test flags new runtime collections that lack a manifest entry. This is not a production database census or an exhaustive assertion about unobserved legacy shapes.
4. Added deterministic namespaced UUIDv8 candidates with a fixed test vector; separate branch/department/doctor projections preserve legacy IDs and explicit relations. Invalid/missing/duplicate dependencies, codes and required flags are rejected. Every candidate retains its complete source only in a private in-memory envelope and has `readyForApply: false`. Known unmapped provenance/descriptions/structured-address/schedule fields and existing SQL target-ID reconciliation still prevent actual import. Patient records, account claims and matching contact fields never become access grants.
5. Added `npm run sql:rehearse` and `npm run test:migration`, wired into existing CI. Rehearsal has no cloud/SDK imports, arbitrary input option, file output, credentials or write mode; all CLI arguments and unsafe project/DB overrides fail closed. Its report contains only fixed category/reason counts, not PHI or source identifiers. Current synthetic report: 25 total; 3 catalogue candidates, 13 deferred, 9 excluded/derived, 0 rejected, 0 ready-for-apply, 0 writes. No content-checksum/checkpoint or production-import readiness is claimed.
6. Initial test failure was sandbox EPERM for subprocess execution; reran the same local checks with process permission, without weakening guards. Combined emulator tests then exposed an inherited emulator-injected PostgreSQL override; isolated CLI test subprocess environments from credentials/DB overrides while keeping explicit negative guard cases. Date/timestamp and 32-bit integer-paise validation, wrong-account/unknown-field privacy cases and source-reference checks are covered.
7. Final checks passed: `npm run test:migration` (9); `npm run sql:rehearse` (the count-only report above); `npm run sql:compile`; `npm run sql:test` (31, including those 9 migration tests); existing Functions/frontend/time/schedule unit suites (60). This is 91 unique passing tests, not 100 by counting the focused migration run twice. Functions/frontend lint, both frontend builds and `git diff --check` passed. Existing Vite large-chunk warnings remain. Firestore rules and HTTP endpoint suites were not rerun this pass because neither rules nor runtime endpoints changed.
8. No production source, schema or frontend behavior changed, so no cloud deployment/API read was required for this local tooling milestone. Both rebuilt sites have the same entry/asset names as the prior verified release; this is not a new live smoke test. No patient export/import, Auth mutation, paid feature, schema migration, network dependency install, commit/push or remote CI run. Next safe work remains P4-02b/03b; later real cutover still requires protected backup/restore evidence.

## Next continuation

Continue at P4-02b: reconcile target IDs and resolve/test lossless field mappings. Inspect `SQL/migration/README.md` first. Do not treat `mapped: 3` as three import-ready records: this is a pure candidate projection with all writes disabled. P4-03b/04/05 remain local work; production backup/restore decisions gate P4-06/07, not progress on the safe local steps.
