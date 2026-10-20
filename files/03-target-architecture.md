# 03 — Target Architecture (source of truth for the design)

SQL migration update (2026-10-19): `SQL/PLAN.md` and `SQL/phase 1.md` govern the new SQL Connect backend. The Firestore model below documents the existing application until each tested module cuts over. Staff authorization remains Firebase custom claims. Do not merge the Firestore scheduler unchanged or switch production storage from this note alone.

Local transaction proof (2026-10-20): two undeployed IAM-only rehearsal operations and a demo/loopback-only driver atomically test one fixed inactive synthetic branch's content/version change, exact timestamp evidence, audit and receipt. Replay, concurrency, rollback, uncertainty and encrypted logical before-image restore are tested, with a fresh restore version. These are NOT production import/restore APIs: exclude rehearsal.gql and regenerate SDKs before any production connector release. No schema table/runtime Function/public role is added, no real record is changed, and 33 local versus 22 last verified deployed tables remain. Existing legacy migration notes below must not override SQL's default-deny/ownership/no-contact-linking/release/backup gates.

Current local guest draft: anonymous appointments preserve a NULL patient FK and private snapshot contact; no contact-based patient identity/link/access is inferred. Only the actual legacy anonymous source shape is mapped, with release/provenance gates retained. Existing target patient assignments cannot be added/removed by import. The local nullable Appointment.patient changes a deployed constraint/API contract and is NOT an additive-only release: separately review exact DDL/deletion behavior and obtain explicit approval, or redesign additively. Do not deploy this draft automatically. Production still has the required FK; patient hard deletes and guest access APIs remain unavailable. See `SQL/migration/README.md` and Phase 4 for tests and release boundaries.

Clinical migration preservation is also LOCAL ONLY: LegacyMedicalHistory/LegacyMedicalDocument store existing clinical text and private document metadata without converting it to finalized visits or authorizing downloads. Complete legacy target identities prevent silent reparenting; missing doctor/visibility/times remain explicit gates. Source doctor and patient references are not verified clinical scope; no PatientLink or permission is created. File bytes stay in current storage, never SQL; private URLs are not fetched or exposed. No clinical connector/runtime cutover is enabled. Local tables: 29; last verified deployed: 22. All import/release/restore gates remain; Phase 7 still has no completed live clinical workflow.

Feedback/audit preservation is LOCAL ONLY: LegacyPatientFeedback retains source moderation/comment/reviewer/times with explicit patient/appointment identity checks and one feedback per appointment. Published state is private history, not publication approval. LegacyAuditRecord preserves historical actor/resource/allow-listed metadata separately from trusted AuditLog, without rewriting historical role labels into permissions. No live reader/writer/public API changes; consent, provenance, resource/deduplication/privacy and importer gates remain. Local schema has 31 tables versus last verified deployed 22; guest relationship release stop remains active.

Counter/request preservation is LOCAL ONLY: LegacyUhidCounter retains safe source counter and BigInt-compared source/target maximum evidence as decimal strings; no counter is raised or UHID allocated. Incomplete census/identity/cutover gates always remain. LegacyBookingRequest preserves resolved appointment/reference/status/key/times without activating retries or inferring caller binding. Current allocation/booking APIs and OperationReceipt are unchanged; no connector exposes the drafts. Local tables: 33; last verified deployed: 22. Ownership/protected importer/restore and existing guest schema release stop remain pending.

Ownership review is LOCAL ONLY and produces zero grants: legacy UID/list/path claims and Auth snapshot risk flags stay private, never auto-create PatientLink or infer family relationships from contact. Staff-created unlinked patients remain unlinked; creator/updater is provenance only. Two nullable local Patient fields preserve creator UID/role objects separately from old creator strings. No new table/connector/runtime authorization change (33 local, last deployed 22). Complete/current Auth and explicit clinic identity/guardian evidence/target acceptance are still needed at coordinated patient cutover; private assessment is not verified ownership or import approval.

Live SQL milestone: see `SQL/phase 2.md` and the current `SQL/phase 3.md`. Contact reads the public profile from SQL. Phase 3 adds four staff projection fields and IAM-only directory operations: a callable verifies current Firebase Auth and reconciles rebuildable staff metadata before returning a bounded directory page. Staff roles remain authoritative in Auth; patient and booking workflows still use Firestore/Functions until their documented cutovers.

P3-07a lifecycle cutover: runtime staff management/password completion now writes SQL metadata/audit rather than Firestore staff profiles. A shared SQL lock serializes Auth changes; pending/completed/incomplete audit events and scoped receipts make failures visible. Auth itself remains the role/credential authority and cannot participate in SQL transactions. See Phase 3's recovery instructions before releasing an uncertain operation's lock. Activity combines SQL events with bounded legacy operational history. Patient/booking and unrelated operational workflows still use their existing Firestore stores.

P3-07b/c is deployed: protected staff routes share a fail-closed session provider; protected callables check live Auth, and doctor appointment/clinical access requires matching ownership. Explicit Firestore FieldValue/Timestamp imports fix the shared helper compatibility issue reproduced by endpoint emulator tests. Direct Firestore signed tokens still retain their expiry boundary; remaining private-data SQL/server cutovers and verified patient linking are not complete. See the Phase 3 log for 82 passing tests and read-only live release checks.

P3-07d foundation: IAM-only patient-link invitations use a hashed, ten-minute, single-use clinic code bound to an explicit patient/account pair after staff identity/guardian verification. The target verified account must accept it; acceptance/revocation and their audits are transactional. The service has no callable/UI yet and does not expand old Firestore access. `SQL/phase 4.md` records source mapping gaps and the next local migration rehearsal; real patient migration remains gated on protected backup/restore decisions.

Phase 4 local tooling: `SQL/migration/` now inventories 25 source categories and validates synthetic source shapes, namespaced new-ID candidates and catalogue dependencies. `npm run sql:rehearse` is fixture-only/count-only and cannot write or read production. Catalogue projections retain a private source envelope but remain explicitly not ready to apply; existing SQL IDs and unmapped fields must be reconciled before imports. No production schema, identity or storage-authority change is introduced by these tools.

P4-02b1 local extension: catalogue candidates now reuse trusted target legacyId mappings and preserve structured branch addresses, department descriptions, source author/timestamps and ordered doctor-department membership. Thirteen additive schema columns supporting these fields exist only in local source/emulators, not production; no API projection exposes the new provenance fields. Field ledgers block unhandled legacy schedules and sub-microsecond precision rather than silently losing them. All real reads/imports/releases remain behind Phase 4 gates.

This is the design the backlog (`04-backlog.md`) builds toward. It fixes the findings in `02-audit-findings.md`. Where a choice depends on the client, the default is stated and the question is in `07-open-decisions.md`. If you deviate, update this file in the same PR.

P4-02b2 local progress: schedule assessment preserves modern-empty precedence, flags conflicting legacy hours and validates IST weekly/exception windows without filtering invalid entries. Notes/reasons remain private; no migration to public notes, SQL schedule writes or live availability change. Remaining schedule identity/provenance/precision storage and other module mappings are still pending.

Patient draft, also local only: 11 nullable Patient demographic/provenance fields plus PatientReportedProfile (patient-keyed allergies/currentMedications/healthNotes). Clinical text is separated from contact details, with no connector operation or runtime caller. No automatic PatientLink, doctor scope, historical consent or audit identity is inferred. Existing 22 deployed tables are untouched (23 locally); missing timestamps/precision/ownership/search and actual import/cutover remain gated. See Phase 4 for exact boundaries.

Appointment/event rehearsal now validates explicit catalogue/patient references, IST dates, nanosecond ordering, states/modes and consent shape. Service and target identity, missing historical evidence, clinical/snapshot/Calendar/video fields and exact storage precision remain blocked; no booking API or occupancy behavior changes. Candidate source envelopes are private and count reports contain no patient data. These are local preflight checks, not an appointment storage cutover.

Further local Phase 4 progress: booking configuration/service candidates now preserve separate before/after buffers, intervals, cancellation cutoff, active/order/paise and historical document metadata without runtime defaults. Ten nullable draft columns support these fields and AppointmentEvent legacy IDs. Appointment/event reconciliation reuses explicit existing legacy identities and checks FK/reference continuity; configured services resolve appointment references. Historical service versions/doctor offerings, missing evidence, private fields and actual imports remain gated. Current SQL Contact is not overwritten from stale legacy settings. Local tables remain 23, deployed 22; no connector or runtime storage cutover is included.

Schedule projection draft: modern weekly hours now map to explicit DoctorScheduleState plus ordered DoctorSchedule windows; exceptions map ordered windows and separate private note/reason/provenance fields. The source-state marker preserves intentional zero-window weekly closure. Legacy-ID snapshots guard target reuse and relationships; old clinic/embedded fallback conflicts still require review. New table plus ten nullable existing-table columns are local only (24 local tables, last verified production 22). No runtime query/cutover reads these fields yet; atomic replacement/version checks and exact precision remain migration work. All-phase estimates/reporting are maintained in `SQL/PROGRESS.md`.

Private appointment draft: separate AppointmentPrivateDetails stores sensitive snapshot/reason/phone-key/Calendar/video/cancellation fields; AppointmentLegacySlot retains ordered historical lock references without becoming occupancy. Thirteen nullable appointment/event fields preserve department/format/actor and private event provenance. Current local table count is 26, last deployed 22. No connector exposes these tables/fields. Event legacyReason is clinical text; future manager projections must omit it. Missing guest patient references, history actions/consent, exact precision, content reconciliation and actual import/cutover remain gated; no contact-based patient creation or ownership inference is introduced.

Exact source timestamp draft: private LegacySourceInstant stores native microseconds plus canonical exact nanoseconds by target type/id/field/source. Bounded preparation uses explicit timestamp fields, keeps clinical strings and source candidates unchanged, and retains all blockers until atomic domain/evidence imports, source checksums and version reconciliation are implemented. Native intervals collapsing to zero stay blocked. PostgreSQL round-trip is tested, including negative epochs and Firestore min/max. Current local tables: 27; last deployed: 22. No connector exposes evidence and no runtime booking time changed.

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
| Contains | marketing pages, booking, login, patient portal | admin, doctor, manager workspaces, staff account |
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
    features/   booking/ patient-portal/ manager/ doctor/ admin/ auth/   # screens (container + view)
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

Roles: **public** (no auth), **patient** (authenticated, no staff claim), **manager**, **doctor**, **admin**. Claims: `role`; doctor also `doctorId` (must equal the record's `doctorId` for doctor-scoped access).

`R` read, `W` write via rules, `C` via callable only, `—` none.

| Resource | public | patient | manager | doctor | admin |
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
| (create) → `scheduled` | public/patient (via `createBooking`), manager/doctor/admin (`createStaffAppointment`) | slot free; within booking window; not in the past |
| `scheduled` → `confirmed` | manager, admin, doctor; or auto (setting `autoConfirm`) | |
| `scheduled`/`confirmed` → `checked_in` | manager, admin | same IST day |
| `checked_in` → `in_consultation` | doctor | |
| `in_consultation` → `completed` | doctor | writes/links a visit record when clinical module exists |
| `scheduled`/`confirmed` → `cancelled` | patient (until cutoff, setting `cancelCutoffHours`), manager, doctor, admin | **`reason` required**; frees slot if in the future |
| `checked_in` → `cancelled` | manager, admin | patient left; reason required |
| `scheduled`/`confirmed` → `no_show` | manager, admin, system job | `now > startsAt + graceMinutes` |
| `scheduled`/`confirmed` reschedule | patient (until cutoff), manager, doctor, admin | new slot free; old slot released; event `rescheduled` |

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
                           status, source:'web'|'manager'|'walk_in'|'phone', tokenNumber?, phoneKey:E.164,
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

- Helpers: `isSignedIn()`, `role()`, `isAdmin()`, `isDoctor()`, `isManager()`, `isStaff()`, `isDoctorOf(doctorId)` (`token.role=='doctor' && token.doctorId==doctorId`), `isLinkedPatient(patientDoc)`.
- `appointments`, `appointmentSlots`, `auditLogs`, `notifications`, `counters`, `events`: `allow write: if false` (Admin SDK bypasses rules).
- `appointments` read: owner (`patientId` in the caller's linked patients — implement by storing `patientUids: [uid]` on the appointment at creation, so rules need no cross-document lookups), staff, doctor of that `doctorId`.
- `doctorSchedules`, `scheduleExceptions`: write only admin/own doctor **and** validate shape (`sessions` is a list of maps with `weekday` 0–6 and `HH:mm` strings; `type` in enum; `dateKey` matches doc id; `doctorId` matches path).
- `patients`: manager/admin create+update via callable only (UHID allocation); patient may update an allow-listed subset (`name`, `altPhone`, `email`, `address`, `bloodGroup`) of a patient they are linked to; no client delete.
- `visits`, `prescriptions`, `documents`: role-scoped per §3, `visits` never readable by manager, patients only when `publishedToPatient == true`.
- Each rule needs positive and negative emulator tests (`08` §3).

### 5.2 Indexes (must be in `firestore.indexes.json`)

- `appointments`: (`doctorId`,`dateKey`,`startsAt`) · (`dateKey`,`startsAt`) · (`status`,`dateKey`,`startsAt`) · (`phoneKey`,`status`,`startsAt`) · (`patientUids` array-contains, `startsAt` desc)
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
| `createStaffAppointment` | manager/doctor/admin | `{patientId | newPatient, doctorId, dateKey, time | walkIn:true, visitType, reason?, source}` | Walk-in: `tokenNumber` from `counters/token-{dateKey}`, `startsAt=now`, no slot. |
| `registerPatient` | manager/admin | patient fields → `{patientId, uhid}` | Duplicate check; allocates UHID transactionally. |
| `closeDay` | doctor/admin | `{doctorId, dateKey, mode:'preview'|'apply', reason, action:'cancel'|'keep'}` | `preview` returns affected appointments; `apply` writes the exception and (if chosen) cancels + notifies. |
| `manageStaffAccount` | admin | existing actions + `invite` | Changes: `provision` refuses existing staff accounts; `invite` sends a password-set link instead of typing a temp password; `disable` and `role` call `revokeRefreshTokens`; last-admin and self-demotion guards; audit entries; strong-password policy. |
| `finalizeVisit` (P2) | doctor | `{visitId}` | Locks note (`lockedAt`), audit. |
| `createInvoice`, `recordPayment` (P2) | manager/admin | … | Sequential invoice numbers per financial year. |
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

`storage.rules` (new): `patients/{patientId}/documents/{docId}` — read: doctor; owning linked patient if `visibleToPatient`; write: doctor, manager (upload), owning patient (upload); limits: ≤ 10 MB, `application/pdf`, `image/jpeg`, `image/png`; a matching Firestore metadata doc must exist. Downloads via short-lived URLs. No public buckets.

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
