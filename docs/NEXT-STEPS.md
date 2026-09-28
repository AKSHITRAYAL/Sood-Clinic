# Recommended Next Steps

Work in this order to keep the clinic system safe and demo-ready.

## 1. Finish the Firebase foundation

- Upgrade to Firebase Blaze only if the clinic accepts the billing implications.
- Deploy `functions/index.js`.
- Confirm `manageStaffAccount` works only for an account carrying the `admin` custom claim.
- Deploy Firestore rules and indexes after reviewing them in the Firebase console.
- Enable Firebase App Check for Hosting/Firestore before public launch.

## 2. Complete staff administration

- Test staff provisioning for admin, doctor, and receptionist roles.
- Add a staff-directory edit flow for names/titles and a clear disable/re-enable confirmation.
- Replace `window.prompt` for temporary passwords with a proper protected form and reauthentication for admins.
- Add audit events for role changes, appointment changes, cancellations, and schedule changes.

## 3. Harden appointment scheduling

- Move appointment creation/slot claiming into a trusted Function once Blaze is enabled.
- Add date/time validation in `Asia/Kolkata`, slot duration settings, cut-off times, and duplicate-booking checks.
- Ensure overrides and weekly schedules are always reflected in the public patient booking screen.
- Test cancellation restores the same slot correctly.
- Add notifications and reminders only after selecting a provider and obtaining patient consent.

## 4. Improve patient records responsibly

- Decide whether patients may self-enter medical history in the production workflow; it is enabled today for the demo.
- If document uploads are required, use Firebase Storage with path-level rules such as `patients/{uid}/...`.
- Do not store actual sensitive records in public collections or browser local storage.
- Add deletion/retention policies and consent copy suitable for the clinic’s legal requirements.

## 5. Improve product quality

- Add automated tests for login routing, role access, booking, cancellation, and Firestore security rules.
- Split large frontend routes with `React.lazy`/dynamic imports; the production JavaScript bundle is currently about 818 kB before gzip.
- Test responsive layouts on phone, tablet, and desktop widths.
- Replace placeholder patient/appointment data with a controlled demo dataset before demonstrations.

## 6. Release hygiene

- Push the local commit `76477ff2` after authenticating GitHub on the development machine.
- Make a new commit for the documentation handoff files in `docs/`.
- Build and deploy Hosting after any frontend change.
- Never commit `.env`, service-account files, Firebase CLI config, node modules, cache directories, or GitHub tokens.
