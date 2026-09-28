# Current Status

Updated: 2026-09-28

## Completed

- Firebase Hosting is live at `https://sood-clinic.web.app`.
- The public clinic site, patient sign-in/sign-up, patient portal, staff entry, staff sign-in, and role-aware route selection are implemented.
- Firebase Authentication persists sessions locally in the browser.
- Password reset is implemented with Firebase Authentication for patient and staff users.
- Patient portal includes profile, appointment history, and manually entered medical-history/document records in Firestore.
- Admin, doctor, and reception workspaces are separate routes.
- Doctor workspace supports recurring Monday-Saturday hours, special-date opening/closure, appointment completion, and cancellation.
- Admin workspace supports appointment oversight, availability overrides, and the UI for secure staff lifecycle actions.
- Firestore rules restrict patient data to the patient or authorized clinic staff.
- Legacy cloned UI, assets, Express/Mongo backend, local Mongo data, and unused frontend packages were removed.
- Frontend lint, frontend production build, and Functions syntax checks passed after cleanup.

## Important limitations

1. **Admin account provisioning is not live yet.** The frontend calls `manageStaffAccount`, but Firebase Functions deployment requires upgrading this project to Blaze. Until then, use `functions/assign-staff-role.js` with a service-account credential to assign roles to existing Firebase Authentication users.
2. **The browser-only booking flow is a demonstration-grade implementation.** It uses Firestore transactions/rules to avoid double booking, but production should add rate limiting, Firebase App Check, stronger input validation, audit logging, notification delivery, and a server-side booking endpoint.
3. **Patient “medical documents” currently store metadata/text only.** No uploaded files are sent to Cloud Storage. Add Firebase Storage and strict storage rules before accepting real files.
4. **No email/SMS reminders are implemented.** These require a delivery provider and likely Functions/Blaze.
5. **There is no DNS subdomain.** `/patient` and `/staff/...` are paths on `sood-clinic.web.app`, which is correct for the current Firebase Hosting configuration.

## Firebase state to verify before demos

- Authentication → Email/Password is enabled.
- The intended administrator, doctor, and reception accounts exist in Firebase Authentication.
- Custom claims are assigned correctly. A user must sign out and sign back in after a claim change.
- Firestore has the seeded catalogue records (`sood-clinic`, `gastroenterology`, `brig-ak-sood`).
- Firestore rules are deployed after any rule change.

## Git status at handoff

- Local cleanup/feature commit: `76477ff2 Refactor Firebase clinic application and remove legacy code`.
- It was **not pushed** because the machine has no GitHub authentication configured (`git push origin main` could not read a username).
- `origin` is `https://github.com/AKSHITRAYAL/Sood-Clinic.git` on branch `main`.
- Do not use the previously exposed personal access token. Create/revoke credentials through GitHub and authenticate the local machine safely before pushing.
