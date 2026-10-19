# Instructions for AI CLIs — follow these steps in order

Read `AGENTS.md` and `SQL/PLAN.md` first. Preserve dirty files. This phase is database foundation, not scheduler implementation or production data migration. Do not merge the scheduler branch. Use the installed CLI via npm scripts, not `npx ...@latest`. Never use production reset/seed, `--force`, `STRICT`, `dataconnect:sql:setup` or broad deployment commands.

Record what you actually ran below, including failures. Do not mark cloud deployment complete because local tests passed. A blocked cloud step does not prevent local implementation. Do not generate credentials, create an instance, or change billing to fix a CLI error.

# Phase 1 — executable plan and execution log

## Scope

Build a SQL Connect schema and minimal explicitly authorized connector operations; generate SDKs without installing a second backend framework; seed only local public reference data; validate real PostgreSQL constraints and connector behavior locally. Keep live Firestore-backed UI operational until a later cutover.

## Files and responsibilities

- `SQL/dataconnect/dataconnect.yaml`: verified existing service, region, instance, database; compatible migrations.
- `SQL/dataconnect/schema/schema.gql`: authoritative initial relational schema.
- `SQL/dataconnect/clinic/`: authorized public catalog and private self-profile reads; no public writes.
- `SQL/dataconnect/admin/`: IAM-only operations for fixtures/server integration; never imported by browser.
- `SQL/generated/clinic/` and `functions/generated/sql/`: compiler-produced browser and Admin SDKs respectively. Regenerate, do not hand-edit. Admin output sits under Functions to reuse its existing `firebase-admin` dependency.
- `SQL/tests/`: local schema and connector integration tests with synthetic fixtures only.
- `SQL/scripts/`: narrowly scoped local checks/seed commands; production mutation guards are mandatory.
- Root `firebase.json`, `package.json`: additive SQL source/emulator/test commands; preserve current Hosting/Firestore/Functions config.
- `files/03-target-architecture.md`: link to the new SQL source of truth; legacy production remains documented.

## Ordered checklist

- [x] P1-01: inspect current repo and authenticated service metadata. Confirmed IDs in PLAN.md; empty deployed schema and no connectors.
- [x] P1-02: define normalized schema with stable IDs, FK relationships, unique keys and server timestamp defaults. No passwords/secrets or raw IP fields.
- [x] P1-03: add connector config, explicit access levels, narrow public projections and self-profile UID binding; generate SDKs.
- [x] P1-04: create deterministic, repeatable emulator-only public catalog fixtures. Include no real patients or account claims.
- [x] P1-05: test real SQL foreign keys/uniqueness/transaction rollback and connector anonymous/self/cross-user behavior. Test that IAM-only operations cannot be called through client authentication.
- [x] P1-06: run compiler, tests, Functions lint, frontend lint/build, existing relevant tests and diff checks. Fix only new failures; report existing failures separately.
- [x] P1-07: deploy verified Hosting milestone using explicit targets; check both domains/entry assets. This validates Hosting availability only, not SQL-backed screens.
- [x] P1-08: production SQL release completed in Phase 2 (see that execution log): compatible migration, schema and both connectors deployed; post-release diff empty. No patient data import.

## Commands (from repository root)

```bash
# First checkout only (use lockfiles):
npm ci
npm --prefix functions ci
npm --prefix Frontend ci
# Every change:
git status --short --branch
npm run sql:compile
npm run sql:test
npm --prefix functions run lint
npm --prefix Frontend run lint
npm --prefix Frontend run build
git diff --check
# Only after the checks pass; does not deploy SQL/Functions/rules:
NO_UPDATE_NOTIFIER=1 node_modules/.bin/firebase deploy --only hosting:public,hosting:staff --project sood-clinic --non-interactive
```

Before any later SQL cloud release, run a read-only diff and inspect it. Do not copy deployment commands blindly from old phases. `schemaValidation: COMPATIBLE` is necessary but does not replace diff review. Never execute fixtures against `sood-clinic`.

## Design decisions

Patient-account links are many-to-many; knowing a phone is not authorization. Staff role lives in Firebase claims; SQL staff metadata cannot grant it. Public catalog excludes patient/staff/settings data. Scheduling tables capture structure only; interval exclusion/occupancy enforcement and booking mutation are Phase 6. `updatedAt` defaults apply on insertion; every future update operation must explicitly set it from `request.time`. CEL timestamp defaults are supplied by SQL Connect; direct SQL imports must supply timestamps themselves. Clinic/public settings are separate from private operational settings. Audit fields contain resource IDs/action codes, never clinical payloads.

SQL Connect generates cascading deletes for required references. Do not expose hard-delete operations for branch/doctor/patient/service master records: archive/deactivate them. Review clinical retention and any necessary RESTRICT constraints before Phase 6/7 data cutover. Range, enum, interval and business-state checks belong to validated future write operations; the foundation currently exposes no patient/appointment writes.

The browser SDK is checked in under `SQL/generated/clinic`; the application does not import it yet. The Admin SDK is checked in under `functions/generated/sql`, reusing the installed Functions dependency. `SQL/migrations/0001-foundation.preview.json` archives compiler-produced DDL (59 additive statements); schema `.gql` remains the source of truth. Do not execute this JSON as an independent SQL migration system.

## Execution log — 2026-10-19

1. Read root agent instructions and Ponytail skill. Clean `main`, starting commit `106415eb`; no changes in other worktrees.
2. Installed Firebase CLI is 15.32.1. Confirmed authenticated `dataconnect:services:list`: existing Mumbai service, existing instance/database identifiers, zero connectors.
3. Read schema using Firebase CLI's authenticated API client: empty source, datasource reports `ephemeral: true`. Production schema application is gated until durable Cloud SQL readiness is verified. No provisioning performed.
4. Added these reproducible plan files and adopted native SQL Connect schema/compiler/SDK generation instead of a parallel ORM/migration runner.
5. Added 19 related SQL tables, primary/foreign/unique keys, query indexes, server-time defaults, narrow public catalog/self-profile operations and IAM-only fixture/health operations. Appointment tables are structure only; no booking writes are exposed.
6. Local compiler succeeded. Official CLI compile with a demo project attempted to fetch remote schemas; added a small wrapper around its installed compiler with no project ID. This uses a Firebase CLI internal API: verify the wrapper when updating the locked CLI version.
7. Local PostgreSQL tests initially exposed a test-harness error: installed Admin SDK caches only service/location, ignoring connector. Named local Firebase apps now isolate each connector; tests use the actual three-argument `executeQuery/Mutation` API and assert authorization-specific failures, not just arbitrary rejection.
8. Six integration tests passed: repeated seed, public projection, FK/unique violations, rollback, anonymous rejection, own-UID binding, IAM denial for patient/admin claims, missing private operations and table inventory. Added a fixture guard test and an external-PostgreSQL override guard afterward; rerun before recording final totals.
9. Existing checks passed: frontend lint and both builds; Functions syntax lint; IST 3/3, schedule 3/3, Functions unit 16/16. Existing Vite large-chunk warnings remain.
10. Separate Cloud SQL read confirms the existing instance is RUNNABLE (PostgreSQL 18, db-f1-micro, zonal, 10 GB, asia-south1), automatic backups off. SQL Connect's empty schema still reports ephemeral; no setting/provisioning changed. Read-only schema diff requested before deciding SQL release readiness.
11. Final local SQL run: 7/7 tests passed. Existing Firestore rules 12/12 passed. No fixture ran against a real project. Added compile/SQL tests to the existing verification workflow (remote CI itself not run here).
12. Reviewed migration preview: 59 statements, all CREATE TABLE/INDEX/EXTENSION, zero destructive changes. Archived exact preview under `SQL/migrations/0001-foundation.preview.json`, marked `applied: false`.
13. CLI behavior correction: `dataconnect:sql:diff` also finalizes an ephemeral service's binding to its existing Cloud SQL database. Verified after preview: schema source remains empty, datasource now refers to existing `public` schema and is no longer ephemeral. No new instance, table or application record was created. Do not assume this command is entirely metadata-read-only on an unlinked service; review CLI behavior before repeating for a new service.
14. Hosting-only deployment succeeded for `sood-clinic` and `sood-clinic-staff`. Source frontend was unchanged; builds remain Firestore-backed. Checking live HTML and entry assets against the exact local built release next.
15. Live smoke checks passed: `https://draksoodgastrocare.com`, `https://sood-clinic.web.app`, `https://sood-clinic-staff.web.app` all returned HTTP 200; entry scripts returned 200 and matched local built HTML. Authenticated patient/staff workflows were not exercised in this pass.
16. Final syntax and whitespace checks passed; external database override self-check also passed. No scheduler merge, Firestore mutation, SQL fixture import to production, new instance, resize, paid backup or provider activation. Changes are uncommitted on `main` for review.

## Current result and exact next step

Phase 1 foundation and production SQL release are now complete; Phase 2 deployed the foundation plus the operation-receipt table after another additive diff review. The cloud service uses the existing instance; no new trial or free operation was assumed. Exact billed totals require billing-console evidence. See `SQL/phase 2.md` for current application integration and the next task. Do not import local test users or fixtures into production.

## Handoff rule

Continue at the first unchecked local step. Update this log after checks/deployments. State exactly whether schema is local, deployed, seeded or wired into the application. Leave production SQL gate unchecked until its evidence exists.
