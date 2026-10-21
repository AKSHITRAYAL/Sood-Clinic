# Instructions for AI CLIs

Read `AGENTS.md`, `SQL/PLAN.md`, `SQL/PROGRESS.md` and this file before Phase 6 work. User requests code-first work: the implementation AI writes code and `SQL/TEST-QUEUE.md` batches; the test AI owns test files and `SQL/TEST-RESULTS.md`. No scheduler callable export, route, mount or deployment until the whole coordinated slice (holds/occupancy/booking/cancel/reschedule/events) is complete, tested and reviewed. Firestore remains authoritative for booking until cutover. Release/rehearsal guards are unchanged.

# Phase 6 — SQL scheduler

Status: inspection and local schema foundation complete 2026-10-20 (local only, not deployed). Percentages stay in `SQL/PROGRESS.md` and do not move until tests and integration support it.

## Inspection (2026-10-20)

- Worktree `/home/keshu/copilot-worktrees/hospital-management-system/akshitrayal-stunning-system`, branch `akshitrayal-scheduler-implementation` is clean and ahead 2; A0-01…A1-03 there are the reference implementation (five-minute unit locks, `placeAppointmentInTransaction`, hashed holds, `createBooking` v2, month availability). Authority: that worktree plus `/home/keshu/Projects/PROMPT-A-scheduler.md` (§4 data model, §5 engine, §6 callable contracts).
- The existing SQL schema already covers the appointment core: `Appointment` (unique `reference`, doctor/clinicDate/startsAt index, nullable patient for guests), `AppointmentEvent`, `AppointmentPrivateDetails`, `DoctorSchedule`/`DoctorScheduleState`, `ScheduleException`/`ExceptionWindow`, `ClinicSettings`, `Service`, `Notification`, `AuditLog`, `OperationReceipt`. `AppointmentLegacySlot` stays historical evidence only and is never occupancy.
- Connector mechanics proven by B012/B013 and reused here: exactly one `query` block per mutation with combined `@check` selections, list checks (`this.size()…`), `vars.x[N]` plus `@include(if:)` bounded conditional inserts, insert-if-absent receipt preflights, and row-count CAS updates.

## Local schema added 2026-10-20 (LOCAL ONLY; `npm run sql:compile` exit 0)

Tables: `AppointmentUnit` (unitKey PK; indexes on doctorId+unitAt and appointmentId), `CalendarBlock`, `WaitlistEntry`, `CalendarFeed`, `DayTokenCounter`, `AppointmentIntake`. Appointment columns: `contactEmail`, `contactEmailLower`, `contactPhoneKey`, `tokenNumber`, `checkedInAt`, `startedAt`, `completedAt`. `AppointmentPrivateDetails` columns: `manageTokenHash`, `manageCreatedAt`, `ipHash`. No connector operation reads or writes any of them yet; the release-check blockers and guest nullability review are untouched.

## Mapping decisions (spec §4 → SQL)

- `visitTypes/{id}` maps onto the existing `Service` (minutes→durationMinutes, buffers, feePaise, mode, active). The extra spec fields (label/slug/color/requiresConfirmation/maxAdvanceDays/intakeQuestions and the per-type before/after buffer split) are an OPEN mapping decision before contract 6.21; default is to extend `Service` with a child intake-question table, never a second visit-type table.
- Spec denormalizations dropped because SQL joins: `visitTypeLabel`/`durationMinutes`/buffer columns on the appointment (read via `service`), `patientRegistryId` (read via `patient`), `slotIds` (units carry the appointment FK — this also satisfies A0-05: no occupancy state on the appointment row), and the `bookingReferences` table (`Appointment.reference` is already `@unique`).
- `kind: 'block'` units dropped: `CalendarBlock` rows plus the engine's separate `blocks` input cover blocking without redundant unit rows (spec §5.4 reads blocks separately in the claim transaction anyway).
- `reminders` become `Notification` rows (existing table, no schema change). Guest `Appointment.patient` nullability keeps its `GUEST_RELATION_RELEASE_REVIEW_REQUIRED` stop; waitlist contact is server-only on `WaitlistEntry`.

## Claim protocol (design to implement in `admin/scheduler-units.gql`)

One `@transaction` mutation `ClaimAppointmentUnits($keys, $unitAts, $kinds, $slot0..$slotN, …)`:

1. `query @redact` with TWO selections: receipt preflight (`@check this == null`) and the live-conflict list over `$keys` excluding expired holds (`@check this.size() == 0` → `SLOT_TAKEN`).
2. `appointmentUnit_deleteMany` removing expired holds among `$keys` (reclaim path).
3. Bounded `@include(if: $slotN)` inserts using `vars.unitKeys[N]`/`vars.kinds[N]` with scalar appointment FK / holdHash / expiresAt.

The handler pre-reads units, blocks and schedule in a separate read operation, recomputes `computeDaySlots`, and only then claims; races between pre-read and claim are caught by step 1, and the `unitKey` primary key is the final backstop (a competing claim makes step 1 fail or the insert violate PK → mapped to `SLOT_TAKEN`). Release/cancel = `deleteMany` by appointment FK; `releaseHold` = `deleteMany` by doctor+holdHash; day cleanup = `deleteMany` by doctor+unitAt range with `expiresAt < now`. Holds store only the SHA-256 of the holdId.

Open decisions with defaults: [x] units-per-claim bound — **96 confirmed compiling** (spec maximum: 240 min visit + 120 + 120 buffers; the generated 96 conditional inserts pass the local compiler, still flagged for review before the booking slice). [ ] rate-limit storage for 6.4/6.6/6.16 — default: mirror the B009 database-time attempt-guard pattern with bucket identity in the key (A1-03 lesson: no shared counter). [ ] external Google busy ranges stay a Function-side input, no SQL table.

Compiler constraints learned 2026-10-20 (binding until proven otherwise): the same mutation field may be selected **once per operation** (`selecting X again is not yet supported` — combine expired-hold and own-hold cleanup with one `deleteMany` + `_or` where); variable definitions need explicit types (`$slotN: Boolean!`); `_and`/`_or` nesting, `in` on strings, `ne` on strings and `ge`/`lt`/`le` on Timestamp all compile (`le`, never `lte`); `vars.x[N]` expressions work in insert `data` for String and Timestamp fields.

## Implementation order (earliest unchecked step first)

1. [x] Port the pure engine from the worktree (`functions/lib/engine/`: units, availability, placement, reference, visitType) onto SQL column names; no exports. Done 2026-10-20: placement now compares `holdHash`, `groupUnitsByDate` consumes SQL unit rows (unitKey/unitAt, expired holds skipped, no legacy-range expansion), everything smoke-requires and is covered by the functions lint list.
2. [x] `admin/scheduler-units.gql` written and compiling: `ReadDoctorUnitRange` pre-read (state, sessions, exception+windows, blocks, units) and `ClaimAppointmentUnits` (combined receipt + `size()==0` live-conflict checks, merged expired/own-hold `deleteMany`, 96 bounded `@include` inserts, audit, receipt) plus `ReleaseAppointmentUnits` and `ReleaseHoldUnits`. Compile exit 0 with all four operations in the generated SDK; SDKs regenerated (test fingerprints must be retaken).
3. Hold/availability backends for 6.2–6.5 on the claim protocol, staged unmounted.
4. `createBooking` v2 + cancel/reschedule (6.6/6.8/6.9) with events, audit, receipt and `Notification` enqueue, staged unmounted.
5. Staff paths (6.10–6.15), waitlist (6.16–6.17), feeds (6.18–6.19), report (6.20) as follow-on batches.
6. UI wiring/mounting, legacy retirement and any deployment only as the final coordinated release with passing tests, release-check review and explicit user approval.

## Gates (unchanged)

`npm run sql:release-check` must keep exiting 1 with its three documented blockers until resolved; guest nullability, identity, backup and source gates stand; App Check console setup is human-only; no deploy, migration or paid resource without explicit approval.
