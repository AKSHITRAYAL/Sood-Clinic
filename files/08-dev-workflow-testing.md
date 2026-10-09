# 08 — Dev Workflow, Testing, CI/CD

## 1. Environments

| Env | Firebase project | Purpose | Deploy |
|---|---|---|---|
| local | emulators (`demo-sood-clinic` project id) | development and all automated tests | `npm run emulators` |
| staging | `sood-clinic-staging` (create in P0-07) | integration, client demos, migration rehearsal, restore drills | auto on merge to `main` |
| production | `sood-clinic` | real patients | manual approval from CI |

`.firebaserc`: `{"projects":{"default":"sood-clinic","staging":"sood-clinic-staging"}}` plus hosting targets (`03 §2.1`). Always pass `--project` explicitly in scripts.

Frontend selects the backend by env var: `VITE_USE_EMULATORS=true` connects Auth/Firestore/Functions/Storage emulators in `lib/firebase.js`; otherwise the project's web config is used (one config per environment, injected via `.env.staging` / `.env.production`, not hard-coded).

## 2. Emulators

Add to `firebase.json`:

```jsonc
"emulators": {
  "auth":      { "port": 9099 },
  "firestore": { "port": 8080 },
  "functions": { "port": 5001 },
  "storage":   { "port": 9199 },
  "hosting":   { "port": 5000 },
  "ui":        { "enabled": true, "port": 4000 },
  "singleProjectMode": true
}
```

Scripts (root `package.json`):

```
"emulators":      "firebase emulators:start --project demo-sood-clinic --import ./.emulator-seed --export-on-exit ./.emulator-seed",
"test:rules":     "firebase emulators:exec --only firestore,storage --project demo-sood-clinic \"vitest run tests/rules\"",
"test:functions": "firebase emulators:exec --only auth,firestore,functions --project demo-sood-clinic \"vitest run functions/test\"",
"test":           "npm run test:rules && npm run test:functions && npm --prefix Frontend run test"
```

Seed script (`scripts/seed-emulator.js`): creates `clinic/*`, `doctors`, `doctorSchedules` (Mon–Sat 08:00–10:00 and 17:00–18:30, 20-min slots), one user per role with claims (`admin`, `doctor` with `doctorId`, `receptionist`), and a patient user. Never point seed scripts at production.

## 3. Rules tests (write first)

Use `@firebase/rules-unit-testing`. Pattern:

```js
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-sood-clinic',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const ctx = {
  anon:      () => env.unauthenticatedContext().firestore(),
  patient:   (uid='p1') => env.authenticatedContext(uid).firestore(),
  reception: () => env.authenticatedContext('r1', { role: 'receptionist' }).firestore(),
  doctor:    (id='brig-ak-sood') => env.authenticatedContext('d1', { role: 'doctor', doctorId: id }).firestore(),
  admin:     () => env.authenticatedContext('a1', { role: 'admin' }).firestore(),
};
```

**Required test matrix** (each is a positive and/or negative case; keep the list in `tests/rules/matrix.test.js` mirroring `03 §3`):

- Anonymous: can read `clinic/publicConfig`, `doctors`, `doctorSchedules`, `scheduleExceptions`, `appointmentSlots`; **cannot** write any of them; cannot read `appointments`, `patients`, `invoices`, `auditLogs`, `notifications`, `counters`; **cannot** create `appointments` or `appointmentSlots`.
- Patient: reads only appointments/patients linked to their uid; cannot read another patient's data; can update only allow-listed patient fields; cannot write `visits`; reads a visit only when `publishedToPatient == true`.
- Reception: reads appointments and patients demographics; **cannot** read `visits`, `patientReported` is read-only, `medicalHistory` legacy denied; cannot write `appointments` directly (must use callable); cannot read `auditLogs`, `staffProfiles` of others.
- Doctor: reads/writes own `visits`/`prescriptions`; cannot read another doctor's appointments; writes own `doctorSchedules`/`scheduleExceptions` with valid shape only; nested-array or bad time strings rejected.
- Admin: reads operations data and `auditLogs`; writes config; cannot read `visits` (D-07 default).
- Shape validation: `dateKey` must match doc id; `weekday` 0–6; `HH:mm` strings; `type` enum.
- Default deny: unknown collection read/write denied for every role.
- Storage rules: allowed types/sizes only; cross-patient access denied.

Rule of thumb: any rule change without a new or updated test is incomplete.

## 4. Function tests

- **Pure modules** (fast, no emulator): `lib/ist`, `lib/availability` (`03 §7` cases), `lib/stateMachine` (every from→to×role), `lib/phone`, `lib/reference`. Share test vectors with the frontend's `allowedTransitions`.
- **Emulator integration:** `createBooking` happy path; **race** (two parallel calls, same slot → exactly one success, one `SLOT_TAKEN`); past time; closed day; outside window; invalid phone; missing consent; per-phone cap; book → cancel → rebook; reschedule swaps slots atomically; `transitionAppointment` per role; `closeDay` preview/apply; `manageStaffAccount` guards (existing staff, last admin, self-demotion, token revocation).
- **Notification tests:** outbox idempotency (same appointment/type creates one doc), retry/backoff with a fake provider adapter.
- Use fixed clocks (inject `now`) — never depend on the wall clock.

## 5. CI/CD (GitHub Actions)

On pull request: `npm ci` (Frontend and functions, **no `--legacy-peer-deps`**) → lint → build both sites (`--mode public`, `--mode staff`) → `npm run test` (emulators) → `npm audit --omit=dev --audit-level=high` (report). On merge to `main`: deploy to staging; production is a separate job with a required manual approval (GitHub Environment).

Sketch (adjust action versions when implementing):

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: '**/package-lock.json' }
      - run: npm ci --prefix Frontend && npm ci --prefix functions && npm ci
      - run: npm --prefix Frontend run lint
      - run: npm --prefix Frontend run build:public && npm --prefix Frontend run build:staff
      - run: npm run test
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2      # Workload Identity Federation, no long-lived key
        with: { workload_identity_provider: ${{ vars.WIF_PROVIDER }}, service_account: ${{ vars.DEPLOY_SA }} }
      - run: npx firebase-tools deploy --project staging --only firestore:rules,firestore:indexes,functions,hosting
  deploy-prod:
    needs: deploy-staging
    environment: production        # requires approval
    # same steps with --project default
```

Also enable: Dependabot (npm, GitHub Actions), secret scanning, branch protection (required checks, no force-push to `main`).

## 6. Deploy and rollback runbook

Deploy order: **indexes → rules → functions → hosting** (indexes take time to build; wait for READY before code that depends on them). For schema changes that need migration: export → run migration on staging → verify → production window → deploy new rules/functions/UI together → keep export for rollback.

Rollback: Hosting → roll back to a previous version in the console/CLI (each site separately); Functions → redeploy the previous git tag; Rules → redeploy previous `firestore.rules` from git; Data → restore from PITR/backup into a new database and compare before switching (never overwrite production blindly).

Tag every production release (`vYYYY.MM.DD-n`) and keep a `CHANGELOG.md`.

## 7. Conventions

- **Commits/PRs:** `P0-02: short imperative summary`; one task per PR; PR description lists what was verified and what needs manual checking; link finding IDs.
- **Formatting:** add Prettier + `eslint-config-prettier` (ENG-07), 100-column limit, no very long single-line components. Run formatting as its own commit to keep diffs readable.
- **Structure:** follow `03 §2.2` and `06 §2`: Firestore/Functions calls only in `services/`; time only via `lib/ist`; errors via `lib/errors` (map `reason` → copy); no business rules in JSX.
- **Errors:** never `catch {}` silently; either handle with user-visible state or rethrow to an error boundary; server errors use `HttpsError` with a `reason` enum; UI never shows raw `error.message` from Firebase.
- **Logging:** `console` only for development; production logging through a tiny `logger` that strips PHI (`05 §5`).
- **Config:** no hard-coded doctor/branch/hours/contact; read from `clinic/*`.
- **Dates/money/phones:** IST helpers; paise integers; E.164 phones normalised in one module used by UI and Functions.
- **Accessibility and states:** follow `06 §3` and `§8` for every screen change.
- **Docs:** if behaviour, schema, roles or contracts change, edit `03` (and `01` if the "current state" changes) in the same PR.

## 8. Local secrets and safety

- Web config is public; everything else (provider keys, service accounts, tokens) goes in Secret Manager (`defineSecret`) for Functions and in GitHub Environment secrets/variables for CI.
- Do not keep service-account JSON on disk long-term; if `assign-staff-role.js` is needed once (first admin), use `gcloud auth application-default login` with a user account that has the needed role, then log out. Delete the script after the first admin exists or gate it behind an explicit `--i-know-this-is-production` flag.
- Never run seed or migration scripts against production without `--dry-run` first and a fresh export.

## 9. Known gotchas

- Plain `npm ci` is the supported install command; do not use `--legacy-peer-deps`.
- Firestore rejects arrays inside arrays; rules and queries also need an index for any `where`+`orderBy` on different fields. A missing index appears as an error object with a console link; without an error callback the UI just looks empty.
- Cloud Functions run in **UTC**; never use local `Date` getters for clinic-time logic.
- Custom-claim changes apply only after the user's ID token refreshes (sign out/in or `getIdToken(true)`); disabling a user does not kill existing tokens unless refresh tokens are revoked.
- The `demo-` project id prefix makes the emulators refuse production calls; keep it for tests.
