# AGENTS.md — Sood Clinic

> Entry point for any AI coding agent (Codex, Claude Code, Cursor, etc.).
> Claude Code reads `CLAUDE.md`: copy this file to `CLAUDE.md` or add `@AGENTS.md` inside it.
> Read this file fully, then read only the docs relevant to your task (map below).

## 1. What this project is

A **real-client** clinic website and management system for **Sood Clinic, Panchkula** (single doctor today: Dr. Brig. A. K. Sood VSM (Retd), gastroenterology; address: House No. 398, Sector 10, Panchkula, Haryana 134109).

Goal: a high-quality **end-to-end clinic management system** made of:

- a **public website** (marketing, booking, patient portal), and
- a **staff website** (admin, doctor, reception),

both served from **one Firebase project** (`sood-clinic`), one domain name, one billing account.

- Repo: `AKSHITRAYAL/Sood-Clinic` (branch `main`)
- Live: `https://sood-clinic.web.app`
- Audit baseline: commit `76477ff`, audited 2026-09-30. Re-verify anything you rely on; the code may have moved.

## 2. Stack and layout

| Path | What |
|---|---|
| `Frontend/` | React 18 + Vite 8 + Tailwind 3 + react-router 7 SPA. Pages in `src/pages`, shared bits in `src/components`, Firebase init in `src/lib/firebase.js`. All CSS is in `src/index.css` (~42 KB, hand-written, plus some Tailwind utilities). |
| `functions/` | Firebase Functions (Node, region `asia-south1`): `clinicApi` (Express, **currently unused/dead**) and `manageStaffAccount` (callable). Also `seed.js` and `assign-staff-role.js` (local admin scripts). |
| `firestore.rules`, `firestore.indexes.json` | Access control and indexes. |
| `firebase.json`, `.firebaserc` | Hosting (single site `sood-clinic`, serves `Frontend/dist`), Firestore, Functions. Project alias `default` = `sood-clinic`. |

Auth model: Firebase Auth email/password. Staff roles are **custom claims** (`role` = `admin` | `doctor` | `receptionist`, doctor also has `doctorId`). Patients are any authenticated user without a staff role.

## 3. Commands (verified 2026-09-30)

```bash
cd Frontend
npm ci
npm run build               # succeeds; one 818 KB JS chunk
npm run lint                # passes clean
npm run dev

cd ../functions
npm install && npm run lint # only does `node --check`; there are no tests
```

Deploy (current): `firebase deploy --only hosting:sood-clinic --project sood-clinic`.
That ships **Hosting only**. Rules, indexes and functions are NOT deployed by it (see `docs/08-dev-workflow-testing.md`).

## 4. Golden rules (do not break these)

1. **Never trust the browser.** Anything that changes appointments, slots, roles, money or clinical data must be validated server-side (callable Function or tightly constrained rules). Target state: clients cannot write `appointments` / `appointmentSlots` directly.
2. **Roles come only from custom claims** set by the Admin SDK. Never derive a role from Firestore data the client can write, from localStorage, or from the URL.
3. **Least privilege.** Receptionist ≠ doctor. Clinical data (visit notes, history, documents, prescriptions) is doctor-only (+ the owning patient where stated in `docs/03`). Do not widen a rule to "make the UI work"; fix the query or the design.
4. **Time is Asia/Kolkata (IST, UTC+05:30, no DST).** Store instants as Firestore `Timestamp`. Also store a `dateKey` (`YYYY-MM-DD`, IST) for day queries. Never use `Date` local getters (`getDay`, `getHours`, `toISOString().slice(0,10)`) for business logic in the browser or in Functions (Functions run in UTC). Use the shared IST helper (task P0-05).
5. **Firestore has no nested arrays.** Store windows as `[{ start: "08:00", end: "10:00" }]`, never `[["08:00","10:00"]]`.
6. **No secrets in the repo.** Firebase web config is public by design; service-account keys, `.env`, tokens are not. `.gitignore` already covers them. Do not weaken it.
7. **Keep rules, indexes, functions and UI in sync.** Any new query needs its index in `firestore.indexes.json`. Any new collection needs a rule AND a rules test. Deploy them together.
8. **Personal health information (PHI).** Do not log patient names, phones or clinical text to `console`, Analytics or Function logs. No third-party scripts on staff or patient pages.
9. **Do not change data shapes silently.** A schema change needs: a note in `docs/03-target-architecture.md`, a migration if production data exists, and updated rules + tests.
10. **Do not do UI redesign work while doing logic tasks** and vice versa (see `docs/06-ui-ux-handoff.md`). Keep presentation and logic separable.

## 5. How to work (protocol)

1. Pick a task from `docs/04-backlog.md` by ID (respect the "Depends on" column). Do not invent scope.
2. Read the linked findings in `docs/02-audit-findings.md` and the design in `docs/03-target-architecture.md`.
3. For rules or backend changes: **write the failing rules/emulator test first**, then the change (`docs/08-dev-workflow-testing.md`).
4. Make small, reviewable changes. One task ID per PR/commit, e.g. `P0-02: move booking to createBooking callable`.
5. Before finishing: `npm run lint` and `npm run build` pass; rules tests pass; you have listed any manual verification still needed (things needing the live Firebase console or real devices).
6. Update the task's checkbox in `docs/04-backlog.md`. If reality differs from the docs, **fix the docs in the same PR**.
7. If a task needs a decision listed in `docs/07-open-decisions.md` and it is unresolved, use the stated default, mark the assumption in the PR, and stop before anything irreversible.

## 6. Things you cannot verify from the repo

Flag these, do not assume: the Firebase billing plan (Spark vs Blaze), Firestore region, whether rules/functions/indexes are deployed and match the repo, whether any production appointment or patient data exists, whether App Check / API-key restrictions are configured, the clinic's real phone/email/fee schedule.

## 7. Doc map

| File | Read it when |
|---|---|
| `docs/01-current-state.md` | You need to know what exists today (routes, collections, flows, dead code). |
| `docs/02-audit-findings.md` | You are fixing a bug/security/UX issue. Every finding has an ID, severity, location, fix and acceptance test. |
| `docs/03-target-architecture.md` | You are designing or changing hosting, data model, rules, state machine or Function contracts. **Source of truth for the target design.** |
| `docs/04-backlog.md` | You need the next task. Phased, with dependencies and acceptance criteria. |
| `docs/05-security-privacy-compliance.md` | Anything touching auth, PHI, consent, logging, legal pages, backups. |
| `docs/06-ui-ux-handoff.md` | You are doing UI/UX work: screen inventory, states, tokens, a11y, the logic/UI contract. |
| `docs/07-open-decisions.md` | A task depends on a client/product decision. |
| `docs/08-dev-workflow-testing.md` | Setting up emulators, tests, CI, environments, deploys. |
