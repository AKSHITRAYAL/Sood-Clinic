# 01 — Current State (as of commit `76477ff`, audited 2026-09-30)

Facts only. Judgements and fixes are in `02-audit-findings.md`. Method: full read of the repo, `npm ci` / `npm run build` / `npm run lint` in a sandbox, fetch of the GitHub page and live URL. The live site is a client-rendered SPA, so the fetched HTML was an empty shell. I could not sign in, so the staff and patient screens were reviewed from code only.

## 1. Repository

- Single commit history line: `76477ff "Refactor Firebase clinic application and remove legacy code"` (17 commits total). The project was migrated from a MongoDB/Express design to Firebase; some leftovers remain (see §7).
- Public GitHub repo (0 stars/forks). It contains real clinic name, address and doctor registration number.
- Clean install, build and lint now pass with plain `npm ci`. A first emulator-backed Firestore deny-by-default test and emulator configuration are present; CI and `storage.rules` still need to be added.

## 2. Hosting and Firebase config

- `firebase.json`: one Hosting site `sood-clinic`, `public: Frontend/dist`, SPA rewrite `** → /index.html`, long immutable cache for static assets. **No security headers, no `/api` rewrite.**
- `.firebaserc`: `default → sood-clinic`. No staging project.
- Firebase web config is hard-coded in `Frontend/src/lib/firebase.js` (fine: public identifiers). Analytics is initialised for every visitor on every route.
- Functions region: `asia-south1`. Functions engine declared as Node 20.
- Firestore rules and indexes files exist. Deploy command in README ships Hosting only.

## 3. Routes (`Frontend/src/App.jsx`)

| Route | Page | Audience | Notes |
|---|---|---|---|
| `/` | Home | public | Hero carousel (hot-linked stock photos), feature strip, doctor blurb |
| `/about` | About | public | Doctor bio, qualifications (MBBS/MD/DNB/DM), reg. HR886, hardcoded hours |
| `/contact` | Contact | public | Address, hardcoded hours, Google Maps iframe. **No phone/email** |
| `/Booknow` | Bookappointment | public | 14-day picker, 20-min slots, name/phone/reason/consent |
| `/login` | Login | patient | Email+password sign-in and sign-up (6-char min) |
| `/reset-password` | PasswordReset | both (`?staff=1`) | `sendPasswordResetEmail` |
| `/patient` | PatientPortal | patient | Profile, appointments list, self-entered history, self-entered "document records" (text only) |
| `/patient/account` | AccountSettings | patient | Display name, change password |
| `/staff` | StaffEntry | staff | Redirects by claim; unauthenticated → **`/login`** (patient page) |
| `/staff/login` | StaffLogin | staff | Signs out non-staff |
| `/staff/admin` | StaffAdmin | admin | Metrics, queue, date exceptions, create staff, staff directory |
| `/staff/doctor` | DoctorSchedule | doctor | Week calendar, day list, weekly hours, date exceptions |
| `/staff/reception` | ReceptionWorkspace | receptionist | List of all appointments; confirm / check-in / cancel |
| `/staff/account` | AccountSettings(staff) | staff | Same as patient account |
| `/doctor/schedule` | redirect → `/staff/doctor` | | |
| `*` | redirect → `/` | | No 404 page |

Route links use mixed casing (`/About`, `/Booknow`); react-router is case-insensitive so it works.

## 4. Data model actually in use (Firestore)

| Collection | Written by | Read by | Shape notes |
|---|---|---|---|
| `branches`, `departments`, `doctors` | seed script only | public | **Not read by the frontend**; only the dead Express API uses them. Constants `BRANCH_ID='sood-clinic'`, `DEPARTMENT_ID='gastroenterology'`, `DOCTOR_ID='brig-ak-sood'` are hard-coded in the UI, rules and functions. |
| `appointments/{id}` | **browser (anonymous allowed)** | staff; owning patient | `id == slotId == "brig-ak-sood_YYYY-MM-DD_HH-mm"`. Fields: `slotId, branchId, departmentId, doctorId, startsAt (ISO string), endsAt (ISO string), reason, status, source:'patient_portal', patientId ('' if anon), createdAt (serverTimestamp), patient:{name,phone,consentToTreatment}`. Later staff writes add `updatedAt (ISO string), updatedBy (client-supplied uid)`. |
| `appointmentSlots/{id}` | browser | public | Same id as the appointment. `{doctorId, appointmentId, startsAt (ISO), status:'booked', createdAt}`. On cancel staff set `status:'available', appointmentId:null`. |
| `clinicSchedules/{doctorId}` | doctor/admin | public | `{doctorId, weekly:{0..6:{enabled, windows:[["08:00","10:00"],…]}}, updatedAt, updatedBy}` — **nested arrays** |
| `availabilityOverrides/{doctorId_YYYY-MM-DD}` | doctor/admin | public | `{doctorId,date,status:'available'|'unavailable',windows:[["hh:mm","hh:mm"]],…}` — **nested arrays**; `available` REPLACES that day's regular hours |
| `staffProfiles/{uid}` | `manageStaffAccount` | admin, self | `{uid,email,name,role,active,updatedAt,updatedBy}` |
| `patients/{uid}` | the patient | staff (all), patient | `{displayName,email,phone,dateOfBirth,bloodGroup,createdAt,updatedAt}`. Doc id = **Auth uid** (no independent registry). Sub-collections `medicalHistory`, `medicalDocuments` are **patient-written**, staff-readable. |
| `clinicSettings` | nobody | admin | Rule exists; unused |

Status values in code: `scheduled`, `confirmed`, `checked-in`, `completed`, `cancelled`.

## 5. Flows as implemented

**Public booking** (`Bookappointment.jsx`): for the chosen date the browser does `getDoc` on that day's override and the weekly schedule, then one `getDoc` per candidate slot (≈9 for a normal day) to see which are booked. On submit it runs a `writeBatch` creating `appointments/{slotId}` and `appointmentSlots/{slotId}` together. Rules require the slot create to reference an appointment whose `slotId` matches. The success message shows `id.slice(-10)` as a "reference". No confirmation notification is sent. Slot times are built with the browser's local timezone.

**Cancel:** staff batch-update appointment `status:'cancelled'` and slot `status:'available'`. Appointment docs cannot be deleted (rule `delete: false`).

**Staff account provisioning:** admin UI → `manageStaffAccount` callable (`provision | role | temporaryPassword | disable`). Custom claims set server-side; `staffProfiles` mirror written. Requires Functions deployed (Blaze). First admin is created with `functions/assign-staff-role.js` and a service-account key.

**Patient signup:** `createUserWithEmailAndPassword` + `setDoc(patients/{uid})`. No email verification. Staff accounts trying the patient login are signed out with a message.

**Role gating in UI:** each staff page re-reads `getIdTokenResult()` claims and shows a gate/redirect; the true enforcement is the Firestore rules.

## 6. Firestore rules summary (`firestore.rules`)

- Public read: `branches`, `departments`, `doctors`, `appointmentSlots`, `availabilityOverrides`, `clinicSchedules`.
- `appointments` create: anyone, with a shape check (`hasOnly` key list, string types, `status=='scheduled'`, `source=='patient_portal'`, consent true, `patientId` empty or own uid). Read: any clinic staff or owning patient. Update: any clinic staff (no field constraints beyond `doctorId`). Delete: never.
- `appointmentSlots` create: anyone (with the matching-appointment `getAfter` check, doctor id and `status=='booked'`). Update: staff, or anyone re-booking an `available` slot with a matching appointment. Delete: doctor/admin.
- `patients` (+ `medicalHistory`, `medicalDocuments`): owner full control; **all clinic staff (including receptionist) can read**.
- `staffProfiles`, `clinicSettings`: admin.
- Default deny for everything else.
- Helper `isDoctor()` also requires `doctorId == 'brig-ak-sood'`.

## 7. Dead / unused / legacy code

- `functions/index.js → clinicApi` (Express `/api/v1/public/booking/*`): not called by the frontend, not routed by Hosting, uses a different data shape (Timestamps, `weeklySchedule` on the doctor doc, random slot ids, server-local `getDay()`), and would create data the current UI cannot read.
- `firestore.indexes.json`: only one index (for the dead API's `doctors` query). The indexes the live UI needs are missing.
- `Frontend/.env.example` describes an `/api` proxy that does not exist.
- `clinicSettings` rule, `branches/departments/doctors` collections (UI-unused).
- CSS in `index.css` for removed screens: `.doctor-workspace`, `.appointment-row*`, `.appointments-card*`, `.availability-card`, `.clinic-feature*`, `.workspace-header/stat/notice`, `.schedule-grid`, `.time-pair`.
- `tailwind.config.js` defines colours `gg`/`bb` that are not used consistently.
- Root `.gitignore` mentions `.mongodb/`, `.runtime/` (legacy).

## 8. Frontend structure and styling

- 13 pages, 4 components. Pages are large single components mixing UI, Firestore calls and business rules. Very long lines (prettier-style formatting absent).
- Duplicated helpers across files: `DOCTOR_ID`, `greeting()`, date-key helpers, auth-guard `onAuthStateChanged` blocks, status-change batches (in Doctor, Reception, Admin).
- Styling: hand-written CSS (`index.css`) for booking, auth, staff, patient screens; Tailwind utilities for Home/About/Contact. Two-plus brand blues in use (`#176dcc`, `#4d8cc6`, `#126bca`, `#173f76`, `#143b70`). Font Manrope via CSS `@import` from Google Fonts. Some `!important` overrides (autofill/input colours). Dark mode configured in Tailwind (`darkMode:'class'`) but not implemented.
- Responsive: 11 `@media` blocks, all `max-width` (desktop-first). Public, staff and patient areas each have partial mobile rules.
- Bundle: one JS chunk 818 KB (244 KB gzip): public visitors download all staff/admin code. Images: doctor photo PNG 435 KB; logo PNG 59 KB; hero images and favicon hot-linked from Pexels/Unsplash/icons8.
- `index.html`: title only. No meta description, Open Graph, structured data, robots.txt, sitemap.

## 9. Integrations that do NOT exist yet

Notifications (SMS/WhatsApp/email), payments, file storage (Firebase Storage not configured), video consultation (advertised on Home/About), prescriptions, billing, patient registry with staff-side creation, audit log, reporting, multi-doctor support, i18n, backups/PITR, monitoring, CI/CD, staging environment.
