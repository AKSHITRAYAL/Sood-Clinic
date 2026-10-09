# 03 — Target Architecture (source of truth for the design)

This is the design the backlog (`04-backlog.md`) builds toward. It fixes the findings in `02-audit-findings.md`. Where a choice depends on the client, the default is stated and the question is in `07-open-decisions.md`. If you deviate, update this file in the same PR.

## 1. Principles

1. **Server is the authority** for booking, status changes, roles, numbering (UHID/invoice/token) and anything financial or clinical. The browser reads via rules and writes through callable Functions.
2. **One Firebase project, two sites, one codebase.** Shared data layer; separate entry points, sessions and security headers.
3. **Presentation is replaceable.** UI components never contain Firestore calls or business rules; they consume hooks/services (`06-ui-ux-handoff.md` §2). This is what lets the UI/UX redesign happen without touching logic.
4. **Least privilege and PHI minimisation** (`05-security-privacy-compliance.md`).
5. **IST everywhere**, `Timestamp` for instants, `dateKey` for day queries.
6. **Config over constants.** Doctor, branch, department, hours, slot length, booking window, contact details come from Firestore config, not source code.
7. **Everything testable in the emulator** (rules tests, function tests).

## 2. Hosting topology and repo layout

### 2.1 Recommended: two Hosting sites in the same Firebase project

| | Public site | Staff site |
|---|---|---|
| Firebase site id | `sood-clinic` (existing) | `sood-clinic-staff` (new) |
| Custom domain | `https://<clinicdomain>` (+ `www` → redirect) | `https://staff.<clinicdomain>` |
| Contains | marketing pages, booking, login, patient portal | admin, doctor, reception workspaces, staff account |
| Robots | indexable (except `/login`, `/patient/*`) | `noindex` on everything, `X-Robots-Tag: noindex` |
| Analytics | public marketing pages only, after consent | none |
| CSP | allows Maps embed, fonts if not self-hosted | strict, no third-party scripts, no framing |

Same Firebase project → one Auth user pool, one Firestore, one Functions codebase, one billing account. Auth sessions are per-origin, so a patient session on the public domain never appears on the staff domain. Add both custom domains (and the `*.web.app`/`*.firebaseapp.com` defaults) to Auth → Authorized domains.

Billing: Hosting usage is metered per project, so a second site in the same project adds no separate hosting plan. Functions already require the Blaze plan. Older Firebase posts also say multiple sites need Blaze. **Verify current pricing/plan requirements in the Firebase console and pricing page before promising the client "no extra cost"**, and set a budget alert.

Fallback if the client wants the simplest setup: keep one site and lazy-load `/staff/*` routes. It meets the "same domain, same charges" wish but shares an origin (session, CSP). The data layer below is identical either way.

### 2.2 Codebase layout (single Vite project, two entry points)

```
Frontend/
  index.public.html            index.staff.html
  vite.config.js               # mode public|staff → outDir dist/public | dist/staff
  src/
    entry/public.jsx           entry/staff.jsx      # routers for each site
    lib/        firebase.js  ist.js  format.js  phone.js  errors.js
    services/   bookingService.js appointmentService.js patientService.js
                scheduleService.js staffService.js …   # ONLY place that calls Firestore/Functions
    hooks/      useAuthClaims.js useAvailability.js useAppointments.js …
    features/   booking/ patient-portal/ reception/ doctor/ admin/ auth/   # screens (container + view)
    ui/         Button Field Card Badge Modal Table Toast … # design-system components (UI phase)
    styles/     tokens.css  base.css
```

`firebase.json` (target shape):

```jsonc
{
  "hosting": [
    { "target": "public", "public": "Frontend/dist/public", "rewrites": [{"source":"**","destination":"/index.html"}], "headers": [/* security + cache */] },
    { "target": "staff",  "public": "Frontend/dist/staff",  "rewrites": [{"source":"**","destination":"/index.html"}], "headers": [/* stricter */] }
  ],
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage":   { "rules": "storage.rules" },
  "functions": [{ "source": "functions", "codebase": "default", "runtime": "nodejs22" }]
}
```

`.firebaserc`: `projects: {default: sood-clinic, staging: sood-clinic-staging}` and `targets.<project>.hosting: {public:[...], staff:[...]}` (created with `firebase target:apply hosting public <site-id>`).

Requests to `/staff*` on the public site 301 to the staff domain.

## 3. Roles and permission matrix

Roles: **public** (no auth), **patient** (authenticated, no staff claim), **reception**, **doctor**, **admin**. Claims: `role`; doctor also `doctorId` (must equal the record's `doctorId` for doctor-scoped access).

`R` read, `W` write via rules, `C` via callable only, `—` none.

| Resource | public | patient | reception | doctor | admin |
|---|---|---|---|---|---|
| `clinic/publicConfig`, `clinic/profile`, `branches`, `departments`, `doctors` | R | R | R | R | R/W |
| `clinic/settings` | — | — | — | — | R/W |
| `doctorSchedules`, `scheduleExceptions` | R | R | R | W own (`doctorId`) | W |
| `appointmentSlots` | R | R | R | R | R (writes: server only) |
| `appointments` | — | R own | R | R (own `doctorId`) | R; all writes **C** |
| `appointments/*/events` | — | — | R | R | R (server writes) |
| `patients` (demographics registry) | — | R/limited W own linked | R/W (via `registerPatient`) | R | R |
| `patients/*/patientReported` | — | R/W own | R (labelled) | R | — |
| `patients/*/visits` (clinical notes) | — | R own **published** summary only | **—** | R/W | — (default; see decision D-07) |
| `patients/*/prescriptions` | — | R own | R (to print/hand out) | R/W | — |
| `patients/*/documents` (+ Storage) | — | R own visible / W own upload | W (upload), R metadata | R/W | — |
| `invoices`, `payments` | — | R own | R/C | R | R/C |
| `staffProfiles` | — | — | R self | R self | R (writes **C**) |
| `auditLogs` | — | — | — | — | R (server writes) |
| `notifications` (outbox) | — | — | — | — | R (server writes) |
| `counters` | — | — | — | — | — (server only) |

Everything not listed is denied (`match /{document=**} { allow read, write: if false; }` stays).

## 4. Appointment state machine and slot model

### 4.1 States

`scheduled` → `confirmed` → `checked_in` → `in_consultation` → `completed`, plus `cancelled` and `no_show`. Terminal: `completed`, `cancelled`, `no_show`. (Rescheduling changes `startsAt` on the same appointment and writes an event; it is not a state, so the patient keeps one reference number.)

Use snake_case values. Migrate old `checked-in` → `checked_in`.

### 4.2 Allowed transitions (enforced only in `transitionAppointment` / `cancelAppointment` / `rescheduleAppointment`)

| From → To | Who | Conditions |
|---|---|---|
| (create) → `scheduled` | public/patient (via `createBooking`), reception/doctor/admin (`createStaffAppointment`) | slot free; within booking window; not in the past |
| `scheduled` → `confirmed` | reception, admin, doctor; or auto (setting `autoConfirm`) | |
| `scheduled`/`confirmed` → `checked_in` | reception, admin | same IST day |
| `checked_in` → `in_consultation` | doctor | |
| `in_consultation` → `completed` | doctor | writes/links a visit record when clinical module exists |
| `scheduled`/`confirmed` → `cancelled` | patient (until cutoff, setting `cancelCutoffHours`), reception, doctor, admin | **`reason` required**; frees slot if in the future |
| `checked_in` → `cancelled` | reception, admin | patient left; reason required |
| `scheduled`/`confirmed` → `no_show` | reception, admin, system job | `now > startsAt + graceMinutes` |
| `scheduled`/`confirmed` reschedule | patient (until cutoff), reception, doctor, admin | new slot free; old slot released; event `rescheduled` |

Every transition writes `appointments/{id}/events/{eventId}` = `{ from, to, byUid, byRole, at (serverTimestamp), reason?, meta? }` and an `auditLogs` entry, and may enqueue a notification.

UI must derive available actions from a shared `allowedTransitions(status, role)` helper (also used by the Function) so no screen shows an illegal button.

### 4.3 Slots

`appointmentSlots/{doctorId}_{yyyyMMddHHmm}` (IST, e.g. `brig-ak-sood_202610010800`) exist **only while the time is held**:

```
{ doctorId, dateKey, startsAt: Timestamp, appointmentId, status: 'booked' | 'blocked', createdAt }
```

Created in the same transaction as the appointment (`create` fails if it exists → `SLOT_TAKEN`). Deleted (not "set available") on cancel/reschedule/close. `blocked` is used by staff to hold a time without a patient. Server-write only; public read is safe because it holds no patient data.

Appointment ids are auto-generated. This removes BUG-02 and SEC-01's "optional lock" hole.

## 5. Firestore data model (target)

Conventions: instants = `Timestamp`; `dateKey` = `YYYY-MM-DD` in IST; phone = E.164 (`+91…`); money = integer **paise**; enum strings snake_case; `createdAt/updatedAt` = server timestamps; **no arrays directly inside arrays**.

```
clinic/publicConfig      { bookingWindowDays:14, slotMinutes:20, leadMinutes:30, visitTypes:[{id,label,minutes}], timezone:'Asia/Kolkata' }
clinic/profile           { name, address{line1,city,state,postalCode}, phone, whatsapp, email, mapsUrl, emergencyNote, socials }
clinic/settings          { autoConfirm, cancelCutoffHours, graceMinutes, reminderOffsetsHours:[24,2], notificationChannels:{…} }   // admin only
branches/{id}            { name, code, active, address, timezone }
departments/{id}         { branchId, name, description, active, publicBookingEnabled, sortOrder }
doctors/{doctorId}       { branchId, departmentIds[], name, qualification, registrationNumber, photoUrl, bio, active, bookingEnabled }
doctorSchedules/{doctorId}    { doctorId, slotMinutes?, sessions:[{weekday:0-6, start:'HH:mm', end:'HH:mm'}], updatedAt, updatedBy }
scheduleExceptions/{doctorId}_{dateKey}  { doctorId, dateKey, type:'closed'|'extra'|'replace', sessions:[{start,end}], note, createdBy, createdAt }
appointments/{id}        { reference:'SC-8XKQ2M', doctorId, branchId, departmentId, visitType, startsAt, endsAt, dateKey,
                           status, source:'web'|'reception'|'walk_in'|'phone', tokenNumber?,
                           patientId, patientSnapshot:{name,phone,sex?,ageYears?}, reason?, 
                           cancel?:{byRole,reason,at}, consent?:{version,acceptedAt},
                           createdBy:{uid|null,role}, createdAt, updatedAt }
appointments/{id}/events/{eventId}   { from, to, byUid, byRole, at, reason?, meta? }
appointmentSlots/{doctorId}_{yyyyMMddHHmm}  (see 4.3)
patients/{patientId}     { uhid:'SC-000123', name, nameLower, phone, altPhone?, email?, sex, dob?, bloodGroup?, address?, guardianName?,
                           linkedUids:[uid], createdBy, createdAt, updatedAt, mergedInto? }
patients/{id}/patientReported/{entryId}   { title, details, createdAt }                 // was medicalHistory
patients/{id}/visits/{visitId}            { appointmentId, doctorId, complaints, history, examination, vitals{…}, diagnosis, advice, followUpDate?, publishedToPatient:boolean, lockedAt?, createdAt, updatedAt }
patients/{id}/prescriptions/{rxId}        { visitId, items:[{drug,dose,frequency,duration,notes}], advice, issuedAt, issuedBy }
patients/{id}/documents/{docId}           { title, category, storagePath, contentType, sizeBytes, uploadedBy:{uid,role}, visibleToPatient, createdAt }
invoices/{id}            { number:'2026-27/0042', patientId, appointmentId?, lines:[{description, amountPaise}], discountPaise, totalPaise, status:'draft'|'paid'|'partial'|'void', createdBy, createdAt }
invoices/{id}/payments/{pid}  { method:'cash'|'upi'|'card'|'online', amountPaise, reference?, at, byUid }
counters/{name}          { value }     // uhid, invoice-{FY}, token-{dateKey}
notifications/{id}       { type, channel, to, template, params, appointmentId?, status:'queued'|'sent'|'failed', attempts, sendAfter, lastError? }
auditLogs/{id}           { at, actor:{uid,role}, action, resource:{type,id}, patientId?, meta? }   // no PHI text
staffProfiles/{uid}      { uid, email, name, role, active, updatedAt, updatedBy }
```

**Patient identity:** the registry id is independent of the Auth uid. One person can have several patients (children, parents sharing a phone) via `linkedUids`; one Auth uid can link several patients. Staff-created patients have empty `linkedUids` until the patient signs up and claims the record (verify by phone/OTP or a clinic-issued code).

**Duplicate handling:** `registerPatient`/`createBooking` look up by `phone` + `nameLower`; same phone with a different name creates a new patient (families), and search shows all matches.

**Search:** phone exact match and `nameLower` prefix range query (`>= q`, `<= q + '\uf8ff'`); no full-text needed at this scale.

### 5.1 Rules design (write tests first)

- Helpers: `isSignedIn()`, `role()`, `isAdmin()`, `isDoctor()`, `isReception()`, `isStaff()`, `isDoctorOf(doctorId)` (`token.role=='doctor' && token.doctorId==doctorId`), `isLinkedPatient(patientDoc)`.
- `appointments`, `appointmentSlots`, `auditLogs`, `notifications`, `counters`, `events`: `allow write: if false` (Admin SDK bypasses rules).
- `appointments` read: owner (`patientId` in the caller's linked patients — implement by storing `patientUids: [uid]` on the appointment at creation, so rules need no cross-document lookups), staff, doctor of that `doctorId`.
- `doctorSchedules`, `scheduleExceptions`: write only admin/own doctor **and** validate shape (`sessions` is a list of maps with `weekday` 0–6 and `HH:mm` strings; `type` in enum; `dateKey` matches doc id; `doctorId` matches path).
- `patients`: reception/admin create+update via callable only (UHID allocation); patient may update an allow-listed subset (`name`, `altPhone`, `email`, `address`, `bloodGroup`) of a patient they are linked to; no client delete.
- `visits`, `prescriptions`, `documents`: role-scoped per §3, `visits` never readable by reception, patients only when `publishedToPatient == true`.
- Each rule needs positive and negative emulator tests (`08` §3).

### 5.2 Indexes (must be in `firestore.indexes.json`)

- `appointments`: (`doctorId`,`dateKey`,`startsAt`) · (`dateKey`,`startsAt`) · (`status`,`dateKey`,`startsAt`) · (`patientUids` array-contains, `startsAt` desc)
- `appointmentSlots`: (`doctorId`,`dateKey`)
- `patients`: (`linkedUids` array-contains) — single-field (auto); `phone`, `nameLower` — single-field (auto)
- `invoices`: (`patientId`,`createdAt` desc), (`status`,`createdAt` desc)
- Remove the obsolete `doctors` composite index used only by the dead API.

## 6. Function contracts (callable, region `asia-south1`, App Check enforced)

Conventions: input validated field by field (reject unknown fields); IST via `lib/ist`; errors are `HttpsError(code, safeMessage, { reason })` with `reason` from a documented enum so the UI can show friendly copy; no PHI in logs; every mutating call writes `auditLogs`.

| Function | Caller | Input → Output | Notes |
|---|---|---|---|
| `getAvailability` | public | `{doctorId, fromDate, toDate}` → `{days:[{dateKey, slots:[{time, startsAt, available}]}]}` | Server is the only place that generates slots (see §7). Cap range to `bookingWindowDays`. Rate-limited. |
| `createBooking` | public/patient | `{doctorId, dateKey, time, visitType, patient:{name,phone,sex?,ageYears?|dob?,email?}, reason?, consent:{version}}` → `{appointmentId, reference, startsAt, status}` | Validates slot ∈ availability; phone normalised; per-phone cap (default max 2 active future appointments) and per-IP throttle; find-or-create patient; transaction: create slot + appointment + `created` event; enqueue confirmation. Errors: `SLOT_TAKEN`, `SLOT_UNAVAILABLE`, `PAST_TIME`, `RATE_LIMITED`, `INVALID_PHONE`, `CONSENT_REQUIRED`. |
| `lookupBooking` | public | `{reference, phone}` → limited appointment view | Rate-limited; returns nothing distinguishing "wrong reference" vs "wrong phone". |
| `cancelAppointment` | patient/guest/staff | `{appointmentId|reference, reason, phone?}` | Patient until `cancelCutoffHours`. Frees slot. |
| `rescheduleAppointment` | patient/guest/staff | `{appointmentId|reference, dateKey, time, phone?}` | Same appointment id; swap slot atomically; event `rescheduled`. |
| `transitionAppointment` | staff | `{appointmentId, to, reason?}` | Enforces §4.2 per role. |
| `createStaffAppointment` | reception/doctor/admin | `{patientId | newPatient, doctorId, dateKey, time | walkIn:true, visitType, reason?, source}` | Walk-in: `tokenNumber` from `counters/token-{dateKey}`, `startsAt=now`, no slot. |
| `registerPatient` | reception/admin | patient fields → `{patientId, uhid}` | Duplicate check; allocates UHID transactionally. |
| `closeDay` | doctor/admin | `{doctorId, dateKey, mode:'preview'|'apply', reason, action:'cancel'|'keep'}` | `preview` returns affected appointments; `apply` writes the exception and (if chosen) cancels + notifies. |
| `manageStaffAccount` | admin | existing actions + `invite` | Changes: `provision` refuses existing staff accounts; `invite` sends a password-set link instead of typing a temp password; `disable` and `role` call `revokeRefreshTokens`; last-admin and self-demotion guards; audit entries; strong-password policy. |
| `finalizeVisit` (P2) | doctor | `{visitId}` | Locks note (`lockedAt`), audit. |
| `createInvoice`, `recordPayment` (P2) | reception/admin | … | Sequential invoice numbers per financial year. |
| `sendReminders` | schedule (every 15 min) | — | Enqueue reminders at `reminderOffsetsHours`. |
| `processNotification` | Firestore trigger on `notifications` create | — | Provider adapter, retries/backoff, idempotent by doc id. |
| `markNoShows` | schedule (nightly) | — | Optional; per `graceMinutes`. |

Delete `clinicApi` (Express) entirely.

## 7. Availability engine (server-side, pure function + tests)

Input: `doctorSchedules/{doctorId}`, `scheduleExceptions` for the dates, held `appointmentSlots`, `now`, `clinic/publicConfig`.

For each IST date `D` in `[today, today + bookingWindowDays]`:
1. `base` = `sessions` where `weekday == weekday(D)`.
2. Apply exception for `D`: `closed` → `[]`; `extra` → `base ∪ exception.sessions`; `replace` → `exception.sessions`.
3. Merge overlapping sessions; generate slots every `slotMinutes` while `slotEnd <= sessionEnd`.
4. Drop slots with `startsAt < now + leadMinutes`.
5. Mark slots `available:false` if a slot doc exists (`booked`/`blocked`).

Unit tests must cover: Sunday closed by default, extra Sunday, closed weekday, replace, overlapping sessions, slot at session boundary, "now" cutoff, DST-free IST arithmetic.

## 8. Notifications

- Outbox pattern: business code inserts `notifications/{appointmentId}_{type}`; a trigger sends. Idempotent, retryable, auditable.
- Channels: WhatsApp (business API provider), SMS (India requires DLT-registered sender/templates), email. Provider chosen in `07` (D-03). Wrap behind `sendMessage({channel,to,template,params})` so it can be swapped.
- Templates: `booking_confirmed`, `reminder_24h`, `reminder_2h`, `cancelled_by_clinic`, `rescheduled`, `followup_due`. Content is minimal (no diagnosis); include reference, time, clinic address, cancel/reschedule link.
- Secrets via Functions secrets (`defineSecret`), never in the repo or Firestore.

## 9. Files (Storage)

`storage.rules` (new): `patients/{patientId}/documents/{docId}` — read: doctor; owning linked patient if `visibleToPatient`; write: doctor, reception (upload), owning patient (upload); limits: ≤ 10 MB, `application/pdf`, `image/jpeg`, `image/png`; a matching Firestore metadata doc must exist. Downloads via short-lived URLs. No public buckets.

## 10. Audit and observability

- Server writes `auditLogs` for: every appointment transition, patient create/update/merge, staff account actions, exception/closeDay, invoice/payment, visit finalize, and (best-effort) "opened clinical record" via a small callable the UI invokes.
- Error reporting/monitoring: Cloud Logging alerts on function error rate; frontend error boundary posting sanitized errors (no PHI); uptime check on the public site and `getAvailability`.

## 11. Multi-doctor / multi-branch readiness

No constants. `doctorId` from `doctors` collection; rules use `isDoctorOf(resource.data.doctorId)`; claim `doctorId` per doctor; booking UI lists doctors/departments from Firestore (single doctor renders as today). Branch selection hidden when only one branch is active.

## 12. Migration from the current data model

Run only if production data exists (**verify first**, `07` D-11). Steps:

1. Export Firestore (`gcloud firestore export`) to a bucket; record the export path.
2. Migration script `functions/migrations/001-target-model.js` (dry-run flag, idempotent, batch of 400):
   - `appointments`: ISO strings → `Timestamp`; add `dateKey` (IST) and `reference`; `checked-in` → `checked_in`; build `patientSnapshot`; find-or-create registry `patients` by phone; add `patientUids` if `patientId` was an Auth uid.
   - `appointmentSlots`: recreate as `{doctorId}_{yyyyMMddHHmm}` for future active appointments only; delete old-format slots.
   - `clinicSchedules`/`availabilityOverrides` → `doctorSchedules`/`scheduleExceptions` (flatten windows; nested arrays could not have been stored, so seed from the default 08:00–10:00 and 17:00–18:30 Mon–Sat if empty).
   - `patients/{uid}` → new registry docs with `linkedUids:[uid]`; `medicalHistory` → `patientReported`; `medicalDocuments` → `documents` (metadata only).
3. Deploy new rules/functions/UI together in a maintenance window; keep the export for rollback.
