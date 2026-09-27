# Careflow database foundation

The legacy models stored doctor, department, and patient values as unlinked strings. The API now uses MongoDB references, validated schemas, compound indexes, and a versioned `/api/v1` API.

## Core records

- **Branch** — clinic location, timezone, active status.
- **Department** — belongs to one branch; controls active/public-booking status.
- **User** — one account and one verified role; passwords are bcrypt hashes.
- **DoctorProfile** — linked to a User, Branch, and one or more Department IDs; includes active/booking status, weekly slots, and leave periods.
- **Patient** — stable clinic identifier, contact/consent/allergy data, and optional portal user.
- **Appointment** — references patient, department, doctor, and branch, with ISO start/end time and an audited status workflow.
- **Encounter** — clinical notes, diagnoses, prescriptions, and vital signs linked to exactly one appointment.
- **Invoice** and **Payment** — structured financial line items, payment constraints, and reconciliation state.
- **AuditEvent** — append-only operational/security activity history.

## Booking rule

`GET /api/v1/public/booking/branches/:branchId/departments` returns only public departments that have at least one active, booking-enabled doctor. A selected department then returns only its available doctor profiles. Appointment writes revalidate the branch, department, doctor relationship, leave periods, published slot timing, and conflicts.

## Local development bootstrap

```bash
cd Backend
cp .env.example .env
npm run seed:development
npm start
```

The seed creates one branch and one active General Medicine doctor. It intentionally demonstrates that the public booking form lists only General Medicine. Do not use seed credentials or the local MongoDB configuration in production.

## Production operations

Use MongoDB Atlas or a replica set with backups, encryption at rest, private networking, monitoring, and tested restores. Store secrets in the deployment platform’s secret manager, set a long unique `JWT_SECRET`, enable TLS at the load balancer, and use MongoDB migrations/index management in CI before deploying application code.
