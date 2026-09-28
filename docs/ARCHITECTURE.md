# Architecture

## Runtime model

Sood Clinic is a React single-page application hosted on Firebase Hosting. Firebase Authentication provides identity, Cloud Firestore stores clinic data, and Firebase Functions is reserved for trusted server-side staff administration.

The Firebase project is `sood-clinic`, the Hosting site is `sood-clinic`, and the public URL is `https://sood-clinic.web.app`.

> The routes `/patient` and `/staff/...` are application paths, not DNS subdomains. Firebase Hosting rewrites all paths to `Frontend/dist/index.html`, and React Router renders the appropriate screen.

## Repository layout

```text
Frontend/                 React + Vite application
  src/
    components/           Shared public-site UI
    assets/brand/         The two production brand/profile images
    lib/firebase.js       Firebase client initialization and local auth persistence
    pages/                Public, patient, and staff route screens
functions/                Firebase Functions and trusted one-time scripts
firebase.json             Hosting, Firestore, and Functions configuration
firestore.rules           Firestore access policy
firestore.indexes.json    Firestore indexes
```

The obsolete Express/Mongo `Backend/` implementation was deliberately removed. Do not restore or depend on it; the live application uses Firebase directly.

## Frontend routes

| Path | Purpose |
| --- | --- |
| `/` | Public home page |
| `/about`, `/contact` | Public clinic information |
| `/Booknow` | Appointment booking flow |
| `/login` | Patient sign-in and patient account creation |
| `/reset-password` | Firebase password-reset request page; accepts `?staff=1` for staff wording |
| `/patient`, `/patient/account` | Authenticated patient portal and account settings |
| `/staff`, `/staff/login` | Staff entry and role-aware staff login |
| `/staff/admin` | Admin operations workspace |
| `/staff/doctor` | Doctor calendar and availability workspace |
| `/staff/reception` | Reception appointment workspace |
| `/staff/account` | Authenticated staff account/profile/password settings |

`Frontend/src/App.jsx` is the authoritative route map. `Frontend/src/lib/firebase.js` explicitly sets `browserLocalPersistence`, so sessions survive browser refreshes.

## Authentication and authorization

- Patients use Firebase email/password authentication from `/login`. Their profile document lives at `patients/{uid}`.
- Staff use the same Firebase email/password provider from `/staff/login`.
- Staff authorization uses Firebase custom claims:
  - `role: "admin"`
  - `role: "doctor", doctorId: "brig-ak-sood"`
  - `role: "receptionist"`
- The browser must never set custom claims. The trusted script `functions/assign-staff-role.js` or the `manageStaffAccount` callable Function does that.
- Password reset uses Firebase Authentication's `sendPasswordResetEmail`. Password changes in account settings reauthenticate the user before calling `updatePassword`.

## Firestore data model

| Collection | Access/use |
| --- | --- |
| `branches`, `departments`, `doctors` | Public clinic catalogue; seeded by `functions/seed.js` |
| `appointments` | Patient booking records; patients may read only their own records, staff may manage them |
| `appointmentSlots` | Public non-sensitive reservation index used to prevent double booking |
| `clinicSchedules` | Recurring weekly availability for `brig-ak-sood` |
| `availabilityOverrides` | Doctor/admin date-specific closures or special hours |
| `staffProfiles` | Staff directory metadata, private to admin/self |
| `patients/{uid}` | Patient profile with `medicalHistory` and `medicalDocuments` subcollections |

The exact security policy is in `firestore.rules`; treat it as production code and change it together with the corresponding UI/data-model changes.

## Hosting and Functions

- `firebase.json` builds from `Frontend/dist` and serves it through Firebase Hosting.
- Functions use Node 20 and region `asia-south1`.
- `functions/index.js` exports:
  - `clinicApi`: legacy-compatible HTTP API surface.
  - `manageStaffAccount`: protected callable function for staff provisioning, role changes, temporary passwords, and disabling accounts.
- The Functions deploy is currently blocked because the Firebase project is on the Spark plan. It needs the Blaze plan before `manageStaffAccount` can be deployed and used.
