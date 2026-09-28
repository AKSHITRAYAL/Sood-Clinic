# Sood Clinic

Firebase-backed appointment and clinic operations application for Sood Clinic, Panchkula.

## Project structure

- `Frontend/` — React and Vite single-page application. Public pages, patient portal, and role-based staff workspaces live in `Frontend/src/`.
- `functions/` — Firebase Functions source, data seeding, and one-time trusted staff-role utilities.
- `firebase.json` — Firebase Hosting, Firestore, and Functions configuration.
- `firestore.rules` and `firestore.indexes.json` — Firestore access controls and indexes.

## Local development

```bash
cd Frontend
npm install
npm run dev
```

Build the hosted application with `npm run build`. Firebase Hosting serves `Frontend/dist`.

## Deployment

```bash
firebase deploy --only hosting:sood-clinic --project sood-clinic
```

Never commit service-account keys, Firebase CLI credentials, or `.env` files.
