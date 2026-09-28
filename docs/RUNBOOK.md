# Development and Deployment Runbook

## Prerequisites

- Node.js 20 or newer.
- Firebase CLI authenticated to the `sood-clinic` Firebase project.
- A local Firebase service-account JSON only for trusted one-time admin scripts. Never commit it.

## Frontend

```bash
cd Frontend
npm install
npm run dev
npm run lint
npm run build
```

The Vite development server normally listens on port `5174`. The production build is written to `Frontend/dist`.

## Firebase Hosting deployment

```bash
cd /home/keshu/Projects/hospital-management-system
cd Frontend && npm run build && cd ..
firebase deploy --only hosting:sood-clinic --project sood-clinic
```

## Firestore deployment

```bash
firebase deploy --only firestore:rules,firestore:indexes --project sood-clinic
```

Review `firestore.rules` before deployment; it protects patient data and staff actions.

## Seed public clinic data

Run only from a trusted machine after setting `GOOGLE_APPLICATION_CREDENTIALS` to a real service-account JSON path:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json" npm run seed
```

## Assign an existing Firebase Authentication user a staff role

This does not create the Auth user. Create the user in Firebase Authentication first, then use:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json" \
CLINIC_STAFF_EMAIL="staff@example.com" \
CLINIC_STAFF_ROLE="admin" \
npm run assign-staff-role
```

Valid roles are `admin`, `doctor`, and `receptionist`. For the doctor, the script also assigns `doctorId: "brig-ak-sood"` by default. The user must sign out and sign in again afterward.

## Firebase Functions

```bash
cd functions
npm install
npm run lint
firebase deploy --only functions --project sood-clinic
```

The last command is expected to fail while the project remains on Spark, because `manageStaffAccount` requires Functions deployment on Blaze. Do not claim the admin provisioning UI is functional until this deploy succeeds.

## Git

```bash
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

The remote is `origin` → `AKSHITRAYAL/Sood-Clinic`. Configure GitHub authentication using GitHub Desktop, SSH, or a newly created fine-grained token kept out of source control. Never put a token in an issue, chat, committed file, or remote URL.
