# 05 — Security, Privacy and Compliance

This is an engineering checklist, **not legal advice**. The clinic (as data fiduciary) should have a lawyer confirm the legal items marked ⚖️ before launch. Findings referenced here are in `02-audit-findings.md`; tasks in `04-backlog.md`.

## 1. Data classification

| Class | Examples | Where | Rules |
|---|---|---|---|
| **Public** | Clinic profile, hours, doctor bio, slot occupancy (no names) | `clinic/*`, `doctors`, `doctorSchedules`, `appointmentSlots` | Public read; server-only write for slots. |
| **Personal (contact)** | Name, phone, email, address, DOB | `patients`, `appointments.patientSnapshot` | Staff + linked patient only. Never in logs/analytics/URLs. |
| **Health (sensitive)** | Reason for visit, history, notes, diagnosis, prescriptions, reports | `appointments.reason`, `patients/*/visits|prescriptions|documents|patientReported` | Doctor (+ owning patient where stated). Reception does **not** read clinical notes. |
| **Financial** | Invoices, payments | `invoices` | Reception/admin + patient own. No card data ever stored (use a payment provider). |
| **Operational secrets** | Provider keys, service accounts | Secret Manager / CI secrets | Never in repo, Firestore or client. |

Treat `reason` (free text) as health data: it is shown only to staff who need it and never in notification texts.

## 2. Top risks and where they are handled

| Risk | Control | Task |
|---|---|---|
| Bot/abuse of public booking (spam, calendar flooding) | Server-side booking only, App Check, per-phone cap, IP throttle, no client writes | P0-02, P0-04 |
| Over-broad staff access (reception reading clinical data) | Role matrix (`03 §3`), rules tests | P0-04 |
| Tampering with appointment state / audit gaps | State machine in callables, events, audit log | P0-03, P1-AUDIT |
| Account takeover of staff | MFA, strong passwords, invite flow, token revocation, idle timeout, console/GitHub 2FA | P1-STAFFSEC |
| Data loss / corruption | PITR + scheduled backups, restore drill | P0-07, P3-HANDOVER |
| XSS / clickjacking / mixed content | CSP, `frame-ancestors`, no third-party scripts on staff/patient, React escaping (no `dangerouslySetInnerHTML`) | P0-06 |
| PHI in logs/analytics | Logging rules (§5), analytics limited to public pages after consent | P1-LEGAL |
| Third-party dependency compromise | Lockfile, Dependabot/`npm audit`, minimal deps | P1-CI |
| Leaked secrets | Secret scanning, `.gitignore` (already present), no service-account keys on laptops where avoidable | P1-CI |
| Public repo of client work | Make repository private (SEC-09) | D-10 |

## 3. Authentication and authorisation checklist

- Roles only via custom claims set by Admin SDK (`manageStaffAccount`); UI checks are convenience, **rules/functions are the enforcement**.
- Staff: MFA required for admin and doctor; reception strongly recommended; invite by email link (no typed temporary passwords); minimum password length ≥ 12 (or passphrase); `revokeRefreshTokens` on disable/role change; last-admin and self-demotion guards; idle timeout (e.g. 15 min on shared reception PCs) with a visible warning.
- Patients: email verification before portal access to records; password ≥ 10; optional phone OTP for booking/claim flows (cost and DLT implications in D-03); brute-force protection is provided by Firebase Auth, keep enumeration protection on.
- App Check enforced (reCAPTCHA Enterprise/v3) for Firestore, Functions and Storage; API key restricted by HTTP referrer to the production/staging domains.
- Separate origins for public and staff sites (`03 §2`); staff site `noindex`, no analytics, strict CSP.
- Callable Functions: check `request.auth.token.role` in code; never trust `request.data.role`; validate all input; return generic errors.
- Firestore rules: deny by default; field allow-lists (`hasOnly`) on any client-writable document; all appointment/slot/audit/counter writes server-only.

## 4. Privacy and legal (India) ⚖️

**Digital Personal Data Protection Act 2023 and DPDP Rules 2025.** The Rules were notified in November 2025 and phase in; the bulk of the operational duties (notice, consent, security safeguards, breach intimation, retention/deletion, rights handling, children's data) apply from **about 13–14 May 2027** according to the law-firm summaries I checked (sources give the date as 13 or 14 May). This system will be in production across that date, so build for it now. Until then the older IT Act SPDI Rules 2011 apply. Have counsel confirm applicability, exemptions and timelines.

Engineering requirements that follow:

1. **Notice and consent** — before collecting personal data show a plain-language notice: what is collected (itemised), why (purpose), how to withdraw consent, how to exercise rights, how to complain. Store `consent:{ version, acceptedAt, purposes[] }` with the booking/registration; keep every version of the notice text in the repo (`content/legal/`).
2. **Purpose limitation and minimisation** — booking asks only for what is needed. Marketing messages need separate, optional consent. Do not put diagnosis in SMS/WhatsApp.
3. **Children and persons with disabilities** — verifiable consent from a parent/guardian for under-18 patients (e.g. `guardianName` + guardian phone on the registry record; capture guardian consent at booking for minors).
4. **Data principal rights** — access/export, correction, erasure (subject to medical-record retention duties), grievance contact. Provide `P2-RIGHTS` tooling and a published contact (email/phone) for requests.
5. **Security safeguards and breach handling** — the safeguards in this doc, plus an incident runbook: detect → contain → assess → notify the Board and affected patients as the Rules require (the summaries mention a detailed report within 72 hours) → post-mortem.
6. **Retention** — define retention periods (appointments, clinical records, invoices, audit logs, notification logs) with the client; medical-record retention duties may override erasure requests. Implement scheduled anonymisation of expired non-clinical data. (Confirm the applicable medical-record retention period with the clinic's counsel/medical council rules.)
7. **Processors and cross-border transfer** — list every processor (Google Cloud/Firebase, SMS/WhatsApp/email providers, payment provider, reCAPTCHA) with purpose and data shared; sign their DPAs; choose an India region for Firestore/Storage/Functions; note that some Firebase products (e.g. Auth, Analytics, App Check/reCAPTCHA) are not tied to the Firestore region — verify where each stores data.

**Medical-practice specifics** ⚖️ (client's counsel to confirm): rules on doctors' advertising and use of testimonials/reviews (relevant to the marketing pages, reviews widgets, before/after content); India's telemedicine practice guidelines if video consultation is launched; requirements for prescriptions (including any e-prescription formatting) and consent for procedures (endoscopy/colonoscopy forms in `P2-GASTRO`).

## 5. Logging, analytics, monitoring rules

- Never log: names, phones, emails, reasons, notes, tokens, full request bodies. Log ids (`appointmentId`, `patientId`) and outcome codes only.
- `auditLogs` store actor, action, resource ids and non-PHI metadata; admin-readable only.
- Firebase Analytics: public marketing pages only, after consent; disabled on `/patient/*`, staff site and booking form fields. No third-party pixels/chat widgets on any page that handles bookings or records.
- Monitoring alerts: function error rate, auth anomalies (spikes in failed staff logins), budget, uptime.

## 6. Backups and recovery

- Enable Firestore PITR and scheduled backups; store exports in a bucket in an India region with restricted access.
- Targets to agree with the client: RPO (data-loss window) and RTO (time to restore). Document the restore steps and **rehearse a restore on staging** (task P3-HANDOVER).
- Keep Storage versioning on for patient documents.

## 7. Secure development and operations

- GitHub: private repo, branch protection on `main`, required checks (lint, build, tests), 2FA for all collaborators, secret scanning and Dependabot on.
- CI deploys with a least-privilege service account via OIDC/Workload Identity; no long-lived tokens in repo or logs.
- Firebase/Google Cloud console: 2FA for all owners, minimum roles (avoid Owner for daily use), separate staging and production projects.
- Dependencies: `npm audit` in CI, pin major versions, review new packages; no unmaintained libraries near auth.
- HTTP headers baseline (all sites): `Content-Security-Policy` (no `unsafe-inline` scripts; hashes/nonces if needed), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (staff: `no-referrer`), `Permissions-Policy` (camera/mic/geolocation off), `Strict-Transport-Security`, `frame-ancestors 'none'`.

## 8. Go-live security checklist

- [ ] Permission-matrix rules tests green in CI; anonymous and cross-patient access attempts denied.
- [ ] App Check enforced; API key restricted; authorized domains correct.
- [ ] Admin/doctor MFA on; a staff account was disabled and confirmed locked out.
- [ ] Privacy notice, terms, consent versioning live; analytics consent works; no analytics on staff/patient.
- [ ] No PHI in logs (spot-check a day of logs); error boundary shows no internals.
- [ ] Backups + PITR on; restore drill done; budget and error alerts firing to a real inbox.
- [ ] Repo private; secrets scanned; CI service account least-privilege.
- [ ] Counsel has reviewed ⚖️ items or the client has signed off in writing.
