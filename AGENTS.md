Current task list: `AI-PROMPT-next-tasks.md` if present; otherwise `files/04-backlog.md`.

USER WORKFLOW OVERRIDE (2026-10-20): code first; a separate AI writes/runs tests. Implementation AI maintains only concise scheduled batches in `SQL/TEST-QUEUE.md`; test AI owns `SQL/TEST-RESULTS.md` and test files. Read both before work; never overwrite the other AI's results/tests or claim scheduled checks passed. Publish batches BUILDING→READY; moving source fingerprints invalidate test evidence. Only quick syntax/compile/lint checks here, no repeated full suites. This overrides the older tests-first protocol below for new work. No untested deployment, production mutation, paid test resources or weakened release/security gates. Avoid additional documentation files; one short phase note per batch is enough.

State pointers: batch status and ownership live only in `SQL/TEST-QUEUE.md` and `SQL/TEST-RESULTS.md`; phase percentages in `SQL/PROGRESS.md`; app state and deploy history in `AI_STATE.md`; module contracts in the `SQL/phase *.md` logs. Do not restate status here.

Durable rules carried by earlier status notes:

- Delivery priority (2026-10-20 user request): build usable workflows, not generic rehearsal tooling. Contact/catalogue/booking-policy/format editors and the linked-patient demographic, appointment-history and self-reported-health backends are implemented through live Auth, generated SDKs and version/audit/receipt transactions — all unmounted and unexported (full contract: `SQL/phase 5.md`). New source moves every runtime publicConfig consumer and catalogue check together; patient/public UI uses published windows and exact-minute cutoffs, never an invented consultation fallback. Fees/doctor offerings are never inferred; schedules/occupancy/appointments/Calendar remain legacy. Not deployed: settings/catalogue census/import, reviewed buffer semantics, and the source/guest release gates. Never deploy just an editor or writer.
- Compiler supports only one query block per mutation: duplicate-date preflight relies on the subsequent shared CAS, not a schema uniqueness constraint; every future SQL closure/import writer must follow that state-revision protocol.
- Generated admin SDKs do not support `_Data` variables; bounded writes use padded primitive arrays with conditional inserts.
- Guardian operational links never grant clinical access without a reviewed consent policy; patient reads stay on operational fields only.
- Do not deploy around the remaining clinical-document, scheduler, source, identity, backup or guest release gates.

RELEASE STOP (2026-10-20): run `npm run sql:release-check` before ANY SQL release. Current draft intentionally exits 1 with synthetic operations/SDKs and guest relation review blockers. Exclude/remove `SQL/dataconnect/admin/rehearsal.gql`, regenerate CJS/ESM/types and resolve the guest DDL/API review; never silence a guard to ship. Only `SQL/scripts/rehearse-branch.cjs` calls the test operations, requiring the exact demo/loopback emulator, fixed inactive synthetic branch and guarded inputs. The client guard is not server-side production authorization. Never deploy these test operations or turn the driver into a real importer. A source-check pass is not release approval.

Active SQL migration (2026-10-19): read `SQL/PLAN.md`, current `SQL/phase 4.md`, `SQL/migration/README.md` and the security handoff in `SQL/phase 3.md`. Current local schema has 33 tables; last verified deployment has 22. All Phase 4 additions remain LOCAL ONLY, without a cloud migration preview/release. Patient/booking storage remains legacy. Preserve dirty files and do not merge the Firestore scheduler worktree unchanged.

Staff directory/lifecycle/audit and shared authorization/doctor scope are deployed. Auth/custom claims remain the role authority; direct Firestore tokens retain their expiry boundary. Patient-link service has no callable/UI and cannot authorize legacy records. Never auto-expire a staff-access lock after uncertain completion; follow Phase 3 recovery instructions.

Local catalogue/patient/service/schedule/appointment/history candidates reuse explicit legacy identities. Health text and meeting-link metadata stay private and grant no access. Modern empty weekly schedules retain a source-state marker. Exact timestamp preparation keeps native microseconds plus nine-digit source evidence, preserves all blockers and requires future atomic import/reconciliation. Fixture rehearsal has zero writes/apply readiness. Preparation is not an importer.

Guest draft preserves explicit anonymous NULL patient references and private snapshots, without identities/access links; existing NULL/non-NULL target reassignments fail closed. RELEASE STOP: local Appointment.patient is nullable, unlike production. This is not purely additive: do not deploy/apply under the normal additive-only rule. Review exact DDL/API/FK deletion behavior and obtain explicit approval or redesign additively. GUEST_RELATION_RELEASE_PENDING remains active. No patient hard-delete or guest-access operation is exposed.

Clinical preservation candidates now map private history/document text/metadata with qualified target IDs, exact timestamp preparation and reparenting checks. They are not finalized visits or download grants. Missing doctor/scope/visibility/time and file verification remain gated; no clinical operation/PatientLink or file fetch is enabled.

Private LegacyPatientFeedback/LegacyAuditRecord now preserve review state and historical audit evidence without publishing reviews, rewriting old role labels into permissions or populating trusted live AuditLog. Consent/moderation, actor/resource/deduplication/privacy and import gates remain. No runtime operation reads these drafts.

Private LegacyUhidCounter/LegacyBookingRequest now retain exact decimal census evidence and original retry history. Incomplete census/identity, behind/exhausted counter and unverified caller/replay gates remain; no allocation, counter repair, active receipt or occupancy grant is enabled. Do not infer a caller from the opaque request key or appointment.

Ownership review tooling now inventories UID/list/path claims privately and flags Auth snapshot/account/family ambiguity with zero grants. It never creates links or approves ownership; creator/updater/contact/directory records confer no access. Actual structured staff createdBy now has two nullable private Patient provenance columns alongside historical scalar storage. Both columns remain undeployed; no new table or operation.

Protected-reader core now supports bounded AES-GCM artifacts, keyed content digests, source/target/code binding and cumulative version-2 inspection-only checkpoints with one blocked/rejected/excluded decision per row from index zero. saveCheckpoint publishes exclusively with file/directory fsync, never overwrites an existing path and distinguishes post-publication uncertain durability; never delete/overwrite uncertain evidence. A crash leaving a temporary hard link fails closed for private recovery. Synthetic tests only. P4-03b remains partial: no real exporter, independently anchored history, mapper execution proof, database commit checkpoint or importer. Old version-1 checkpoints require reinspection; end-of-input is not migration completion. Never persist keys/plaintext exports in the repo. See SQL/migration/README.md for exact limits.

Validator-coupled inspectAndSave now uses the existing pure full-batch mappers, ownership/schedule checks and exact timestamp preparation, recomputes prior decisions on resume and emits count-only reports. Caller decision overrides are rejected; low-level manual checkpoints alone remain no proof of validator execution. All outcomes are blocked/rejected/excluded, with no row write/access grant. Private unknown-field evidence remains retained.

Offline reconcileSnapshot now compares encrypted baseline/current source content, explicit target table/key/full-content/opaque-version snapshots and target identity metadata. It detects additions/removals/content/version drift without returning private data or repairing anything. Unchanged snapshots retain RECONCILIATION_ONLY/ATOMIC_VERSION_GUARD_PENDING/CENSUS_COMPLETENESS_PENDING; NULL versions add a missing-evidence blocker. No trusted producer, live freshness or candidate overwrite approval is implied.

Fixed candidate/content comparisons now cover catalogue, patient/private health, clinical history/documents, appointment/event/private details/slots, feedback/audit, counters/requests, config/services and modern schedules/state/windows/exceptions, each with scoped LegacySourceInstant evidence. One closed-contract routine preserves missing reused identity/unlinked collision/content/scope/version/unaccounted-row gates. Patient ownership is reassessed with zero grants; per-row service/schedule identity decisions must be unambiguous, and singleton settings authority stays under review. Old clinic/embedded schedule authority and other missing evidence are not reconciled by content equality. No insert/overwrite/delete/apply or public runtime access is enabled. Read README extraction/projection limits.

Fixed synthetic IAM transaction proof now commits branch expected-name/native-version CAS, exact timestamp evidence, audit and payload-bound receipt together. Generated Admin SDK driver tests replay/concurrency/stale writes/late rollback/lost response/unknown outcomes and replay scope/evidence/audit tampering. Encrypted logical before-image restore verifies business fields with a NEW version/audit; it is not full database backup/PITR restore. Only synthetic emulator rows are written/cleaned. Inspection candidates remain blocked with zero writes. P4-04/P4-05 stay partial; no real patient/domain importer is enabled.

Read-only local target capture now derives all columns/ordered primary keys for 23 explicit domain tables inside one consistent read-only snapshot and returns encrypted bytes/counts. Exact SQL UTC strings avoid JS Date precision loss; missing/unsupported/oversized data rejects rather than truncating. Auth/staff/links/invitations/receipts/live audit are excluded. Demo/loopback/external-connection/key guards remain; no real source/census/backup authority is claimed. Tests cover capture/encryption → atomic fixture update → domain/evidence drift, and oversized census cleanup.

Next: trusted real source/census and retained-domain import/commit-checkpoint/restore contracts, retaining P4-02b2 ownership/authority blockers and never applying unresolved real candidates. Cumulative inspection snapshots alone cannot detect selection of an older valid checkpoint without a trusted tip. Unknown transaction outcome stays uncertain until committed state/receipt reconciliation; do not guess rollback, clear locks or retry with a new ID blindly. A protected local reader may process blocked synthetic rows but cannot clear gates or enable apply. Do not infer patient ownership from contact/UID/snapshot matching or historical actor roles, doctor offerings/prices from current service configuration, or missing actions/consent/timestamps. Real migration remains behind backup/restore, guest DDL/API review and clinic evidence gates.

Every final work report must include all phase percentages and the overall estimate from `SQL/PROGRESS.md` plus the current test evidence from `SQL/TEST-RESULTS.md`; never claim a check that was not run. `npm run sql:release-check` still exits 1 with its documented blockers (EXPECTED HOLD). No production import, release or new paid resource.

# AGENTS.md — Sood Clinic

> Entry point for any AI coding agent (Codex, Claude Code, Cursor, etc.).
> Claude Code reads `CLAUDE.md`: copy this file to `CLAUDE.md` or add `@AGENTS.md` inside it.
> Read this file fully, then read only the docs relevant to your task (map below).

## 1. What this project is

A **real-client** clinic website and management system for **Sood Clinic, Panchkula** (single doctor today: Dr. Brig. A. K. Sood VSM (Retd), gastroenterology; address: House No. 398, Sector 10, Panchkula, Haryana 134109).

Goal: a high-quality **end-to-end clinic management system** made of:

- a **public website** (marketing, booking, patient portal), and
- a **staff website** (admin, doctor, manager),

both served from **one Firebase project** (`sood-clinic`), one domain name, one billing account.

- Repo: `AKSHITRAYAL/Sood-Clinic` (branch `main`)
- Live: `https://sood-clinic.web.app`
- Audit baseline: commit `76477ff`, audited 2026-09-30. Re-verify anything you rely on; the code may have moved.

## 2. Stack and layout

| Path | What |
|---|---|
| `Frontend/` | React 18 + Vite 8 + Tailwind 3 + react-router 7 SPA. Pages in `src/pages`, shared bits in `src/components`, Firebase init in `src/lib/firebase.js`. All CSS is in `src/index.css` (~42 KB, hand-written, plus some Tailwind utilities). Two entries build separate bundles: `src/entry/public.jsx` → `dist/public`, `src/entry/staff.jsx` → `dist/staff`. |
| `functions/` | Firebase Functions (Node 22, region `asia-south1`): ~40 callables exported from `functions/index.js` (booking/availability, staff lifecycle, catalogue/contact/policy, calendar, feedback, video, SQL staff directory). The legacy `clinicApi` Express surface was removed 2026-10-10. Local admin scripts: `seed.js`, `assign-staff-role.js`, migration helpers. |
| `firestore.rules`, `firestore.indexes.json` | Access control and indexes. |
| `firebase.json`, `.firebaserc` | Hosting — two sites on one project: public `sood-clinic`, staff `sood-clinic-staff` (serves the `Frontend/dist` builds), plus Firestore and Functions config. Project alias `default` = `sood-clinic`. |

Auth model: Firebase Auth email/password. Staff roles are **custom claims** (`role` = `admin` | `doctor` | `manager`, doctor also has `doctorId`). Patients are any authenticated user without a staff role.

## 3. Commands

```bash
cd Frontend
npm ci
npm run lint                # passes clean
npm run build               # builds both the public and staff bundles
npm run dev

cd ..
npm run test:time           # IST helper tests
npm run test:rules          # Firestore rules via the demo-project emulator
npm --prefix functions run lint
```

The canonical full check list (SQL compile, `sql:test`, vitest suites, `sql:release-check`) lives in `SQL/TEST-QUEUE.md` §Commands.

Deploy Hosting only: `NO_UPDATE_NOTIFIER=1 npx firebase-tools deploy --only hosting:public,hosting:staff --project sood-clinic` (build `Frontend` first).
It ships **Hosting only** — rules, indexes and functions are NOT deployed by it and need explicit approval (see `files/08-dev-workflow-testing.md`).

## 4. Golden rules (do not break these)

1. **Never trust the browser.** Anything that changes appointments, slots, roles, money or clinical data must be validated server-side (callable Function or tightly constrained rules). Target state: clients cannot write `appointments` / `appointmentSlots` directly.
2. **Roles come only from custom claims** set by the Admin SDK. Never derive a role from Firestore data the client can write, from localStorage, or from the URL.
3. **Least privilege.** Manager ≠ doctor. Clinical data (visit notes, history, documents, prescriptions) is doctor-only (+ the owning patient where stated in `files/03`). Do not widen a rule to "make the UI work"; fix the query or the design.
4. **Time is Asia/Kolkata (IST, UTC+05:30, no DST).** Store instants as Firestore `Timestamp`. Also store a `dateKey` (`YYYY-MM-DD`, IST) for day queries. Never use `Date` local getters (`getDay`, `getHours`, `toISOString().slice(0,10)`) for business logic in the browser or in Functions (Functions run in UTC). Use the shared IST helper (task P0-05).
5. **Firestore has no nested arrays.** Store windows as `[{ start: "08:00", end: "10:00" }]`, never `[["08:00","10:00"]]`.
6. **No secrets in the repo.** Firebase web config is public by design; service-account keys, `.env`, tokens are not. `.gitignore` already covers them. Do not weaken it.
7. **Keep rules, indexes, functions and UI in sync.** Any new query needs its index in `firestore.indexes.json`. Any new collection needs a rule AND a rules test. Deploy them together.
8. **Personal health information (PHI).** Do not log patient names, phones or clinical text to `console`, Analytics or Function logs. No third-party scripts on staff or patient pages.
9. **Do not change data shapes silently.** A schema change needs: a note in `files/03-target-architecture.md`, a migration if production data exists, and updated rules + tests.
10. **Do not do UI redesign work while doing logic tasks** and vice versa (see `files/06-ui-ux-handoff.md`). Keep presentation and logic separable.

## 5. How to work (protocol)

1. Pick a task from `files/04-backlog.md` by ID (respect the "Depends on" column). Do not invent scope.
2. Read the linked findings in `files/02-audit-findings.md` and the design in `files/03-target-architecture.md`.
3. For rules or backend changes: **write the failing rules/emulator test first**, then the change (`files/08-dev-workflow-testing.md`).
4. Make small, reviewable changes. One task ID per PR/commit, e.g. `P0-02: move booking to createBooking callable`.
5. Before finishing: `npm run lint` and `npm run build` pass; rules tests pass; you have listed any manual verification still needed (things needing the live Firebase console or real devices).
6. Update the task's checkbox in `files/04-backlog.md`. If reality differs from the docs, **fix the docs in the same PR**.
7. If a task needs a decision listed in `files/07-open-decisions.md` and it is unresolved, use the stated default, mark the assumption in the PR, and stop before anything irreversible.

## 6. Things you cannot verify from the repo

Flag these, do not assume: the Firebase billing plan (Spark vs Blaze), Firestore region, whether rules/functions/indexes are deployed and match the repo, whether any production appointment or patient data exists, whether App Check / API-key restrictions are configured, the clinic's real phone/email/fee schedule.

## 7. Doc map

| File | Read it when |
|---|---|
| `files/01-current-state.md` | You need to know what exists today (routes, collections, flows, dead code). |
| `files/02-audit-findings.md` | You are fixing a bug/security/UX issue. Every finding has an ID, severity, location, fix and acceptance test. |
| `files/03-target-architecture.md` | You are designing or changing hosting, data model, rules, state machine or Function contracts. **Source of truth for the target design.** |
| `files/04-backlog.md` | You need the next task. Phased, with dependencies and acceptance criteria. |
| `files/05-security-privacy-compliance.md` | Anything touching auth, PHI, consent, logging, legal pages, backups. |
| `files/06-ui-ux-handoff.md` | You are doing UI/UX work: screen inventory, states, tokens, a11y, the logic/UI contract. |
| `files/07-open-decisions.md` | A task depends on a client/product decision. |
| `files/08-dev-workflow-testing.md` | Setting up emulators, tests, CI, environments, deploys. |
