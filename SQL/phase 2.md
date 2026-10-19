# Instructions for AI CLIs

Read `AGENTS.md`, `SQL/PLAN.md`, and `SQL/phase 1.md`. Preserve all existing edits. Continue the earliest unchecked step below and append commands/results as work progresses. Do not migrate patient records, merge the scheduler branch, reset production, or create/resize cloud resources. Public contact integration must not change booking IDs or booking services. SQL schema/connector deployment and Hosting deployment are distinct steps.

# Phase 2 — managed operations and first application integration

## Checklist

- [x] P2-01: reverify instance, database, trial/cost status and additive migration preview. Reuse existing paid resources; do not activate providers/backups or assume a trial.
- [x] P2-02: add a verified-user account profile mutation with UID binding, validation, inactive-account protection, scoped retry receipt and transactional audit. Tests must prove anonymous/unverified/cross-user protection, no role escalation, safe retry and concurrency.
- [x] P2-03: generate SDKs, run SQL integration/regression tests; review exact cloud schema diff before applying it.
- [x] P2-04: apply compatible schema migration and deploy the two reviewed connectors on the existing service; verify zero required schema differences and anonymous/private operation behavior.
- [x] P2-05: import only the existing public clinic contact details using an IAM-only, parameterized, audited operation. No fixtures, Auth accounts, patients or other catalog IDs in this release.
- [x] P2-06: connect Contact page through a narrow generated SQL query and a frontend service. Preserve its design, loading/error/retry behavior and clinic phone accessibility. Do not silently fall back to Firestore or seed data.
- [x] P2-07: lint/build both sites, test browser SDK against the actual public operation, deploy both Hosting sites and verify rendered Contact page if browser tools are available. Record limits of live checks.

## Boundaries

The verified-account workflow is an API foundation; existing Auth/patient/staff profile screens do not switch their authority until their later coordinated migration. Public Contact uses one SQL row after this milestone. Booking catalog, availability, patient records and staff administration remain in their existing stores. No permanent dual writes are introduced. The new client SDK never receives an Admin SDK or credentials.

## Execution log — 2026-10-19

1. User explicitly authorized continuing integration; no manual integration is required from them. Re-read agent instructions and plans; prior Phase 1 changes are uncommitted and preserved.
2. Cloud SQL read confirms same RUNNABLE Mumbai instance (`db-f1-micro`, 10 GB, PostgreSQL 18), created 2026-10-17. Label is `firebase-data-connect=nt`, not `ft`; pricing is `PER_USE` and activation `ALWAYS`. Do not describe this as an active free trial. No instance configuration changed. Current baseline running costs predate this integration; additional API/transfer usage is metered. Official cost references: https://firebase.google.com/docs/sql-connect/pricing and https://cloud.google.com/sql/pricing/ . Exact invoice/trial entitlement is not confirmed by labels alone.
3. Wrote failing tests before profile API/schema changes. Added scoped retry-receipt table and atomic `SaveOwnSqlProfile` with verified email, name validation, forced-password and inactive-account checks, actor-bound UID and audit. No role can be supplied by the client. Added narrow public Contact query and IAM-only parameterized contact-import operation.
4. Compiler caught unsupported operation-level/repeated checks and mutually exclusive `@auth(level, expr)` usage; corrected to supported authorization expressions and transaction query checks. Always compile before cloud deploy.
5. SQL integration run passed 11/11 tests, including browser SDK/emulator query and concurrent retry (one commit/audit/receipt). PGlite shares a backend session: test teardown explicitly rolls back rejected transaction state before the next case. This emulator run is not a production load test.
6. Frontend service uses generated SDK with Firebase Vite deduplication, five-minute in-memory public cache, shared in-flight request, safe errors and retry after failure. Two service tests passed. Existing unit checks passed (24 tests total including new service tests); frontend/Functions lint and both builds passed.
7. Reviewed/archived 60 additive DDL statements in `SQL/migrations/0002-integration.preview.json`. `dataconnect:sql:migrate --service ak-sood-clinic-service --project sood-clinic --non-interactive` succeeded on the existing database; no destructive DDL, `--force`, instance provisioning/resize, paid backups or provider activation. It set up the standard SQL Connect database IAM permissions. Starting connector deployment separately next.
8. SQL-only deployment succeeded with `firebase deploy --only dataconnect:ak-sood-clinic-service --project sood-clinic --non-interactive`: schema plus `clinic` and `clinic-admin` connectors. Subsequent `dataconnect:sql:diff --project sood-clinic --non-interactive --json` returned `diffs: []`.
9. `node SQL/scripts/import-contact.cjs` previewed one public profile; `node SQL/scripts/import-contact.cjs --apply` imported the published website's contact values and verified them with an anonymous query. This is not the emulator fixture seed; no patient, user, staff or appointment rows were imported. Repeat invocation compares the existing row and makes no write if it matches, and refuses to overwrite differences.
10. Live read-only SQL checks passed: correct public phone/email; anonymous `GetOwnSqlProfile` and IAM-only `CheckSqlFoundation` denied. No production test user was created. Account mutation and role/forced-password/invalid-variable negative tests remain local, using synthetic accounts.
11. Final expanded local suite passed 11/11; frontend service tests 2/2. Added the service tests to CI. CI has not been triggered remotely by this uncommitted change.
12. Both Hosting sites deployed successfully with explicit `hosting:public,hosting:staff` targets after build/lint. HTTP and entry-asset checks matched the built public and staff releases. The public build includes SQL Connect only on the Contact route; staff UI continues its current backend workflows.
13. Real browser verification on `https://draksoodgastrocare.com/contact` passed after reload: SQL-loaded name/address, telephone link `tel:+918988207797`, email link `mailto:Atulsooddr@gmail.com`, map, consultation hours and navigation present. No error or retry banner. This proves public browser integration; it does not prove authenticated patient/staff migrations, which have not yet been performed.

## Result and next phase

Phase 2 milestone complete and live. No manual integration is needed from the user. SQL Connect has 20 foundation tables and two deployed connectors; Contact is the first consumer. Verified-account name save is a tested/deployed API foundation; existing account screens have not switched authority. No patient/appointment/staff record migration occurred.

Next is Phase 3 identity/staff security: inventory existing Firebase Auth/custom claims and all profile readers/writers; design a restartable UID/staff metadata projection, tests for deactivation/stale sessions and doctor scope, then migrate those workflows together. Preserve Auth as identity provider and custom claims as staff authority. Do not point existing booking IDs to the new SQL UUID catalog before Phase 6. Before any real patient data migration, resolve backup/restore configuration and its cost explicitly; paid backups remain disabled.

Rollback for this milestone: restore the previous Contact component from the prior source/build and rebuild/redeploy public Hosting. Leave additive SQL tables intact; never drop them as a website rollback. This returns Contact to its original static content without changing bookings or patient records.

## Exact commands for continuing safely

```bash
npm run sql:compile
npm run sql:test
node_modules/.bin/vitest run Frontend/src/services/clinicProfileService.test.js functions/test tests/time tests/schedule
npm --prefix functions run lint
npm --prefix Frontend run lint
npm --prefix Frontend run build
git diff --check
```

Do not repeat migration/import just to check availability. Cloud schema is now deployed. `node SQL/scripts/import-contact.cjs` is a read-only comparison once the profile exists; never add `--apply` to a changed payload without reviewing that change. The `cloud.cjs` helper is local deployment tooling using existing Firebase CLI authentication; never import it into frontend or deployed Functions. Its use of CLI internal APIs must be checked when updating firebase-tools.

## Next steps / handoff

Continue the first unchecked task. Never claim the whole website uses SQL because Contact is integrated. Document remaining authenticated frontend migrations and real-user verification.
