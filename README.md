# Sood Clinic

Firebase-backed appointment and clinic operations application for Sood Clinic, Panchkula.

## Project structure

- `Frontend/` — React and Vite single-page application. Public pages, patient portal, and role-based staff workspaces live in `Frontend/src/`.
- `functions/` — Firebase Functions source, data seeding, and one-time trusted staff-role utilities.
- `firebase.json` — Firebase Hosting, Firestore, and Functions configuration.
- `firestore.rules` and `firestore.indexes.json` — Firestore access controls and indexes.

## Continuation guides

- [Architecture](docs/ARCHITECTURE.md) explains the routes, Firebase data model, roles, and deployment model.
- [Current status](docs/STATUS.md) records what is live, what is demo-only, and the known deployment limitation.
- [Runbook](docs/RUNBOOK.md) contains local development, Firebase, role-assignment, and Git commands.
- [Recommended next steps](docs/NEXT-STEPS.md) is the ordered continuation plan.

## Local development

```bash
cd Frontend
npm ci
npm run dev
```

Build the hosted application with `npm run build`. Firebase Hosting serves `Frontend/dist`.

## Local Firebase checks

From the repository root, run `npm ci` once, then `npm run test:rules`. It launches the
Firestore emulator against the deliberately fake `demo-sood-clinic` project and verifies
that unknown Firestore collections remain inaccessible. It never contacts production.

## Deployment

```bash
firebase deploy --only hosting:sood-clinic --project sood-clinic
```

Never commit service-account keys, Firebase CLI credentials, or `.env` files.
