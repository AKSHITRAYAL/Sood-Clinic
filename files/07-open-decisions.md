# 07 — Open Decisions (client / product)

Each item changes scope, cost or design. If a decision is unresolved, an agent proceeds with the **default**, records the assumption in the PR, and stops before anything irreversible (data deletion, paid-service commitments, public claims). Update this file when a decision is made (fill "Decision" and date).

| ID | Question | Why it matters | Default (assume until told) | Blocks |
|---|---|---|---|---|
| D-01 | What is the **domain name**, who owns the registrar account, and who pays renewals? | Public + staff sites need custom domains; email deliverability; App Check keys, Auth authorized domains | Use `sood-clinic.web.app` (+ staff site default URL) until supplied; client owns the domain | P1-SPLIT, P3-DOMAIN |
| D-02 | One site with lazy-loaded `/staff` routes, or **two Hosting sites** (public + `staff.` subdomain) in the same project? | Origin isolation, headers, bundle size; both meet "same domain, same project, same charges" | Two sites (`03 §2`); fallback to one | P1-SPLIT |
| D-03 | **Notification channels and providers**: WhatsApp, SMS (DLT registration), email — which, and who pays per message? | Recurring cost; India SMS needs DLT-registered sender/templates; WhatsApp needs a business account/provider | Email + WhatsApp confirmations/reminders behind an adapter; SMS optional | P1-NOTIFY |
| D-04 | Is **video consultation** real? | Home/About advertise it but nothing exists; telemedicine guidelines apply | Not built; qualify or remove the claim (P1-CONTENT) | P2-VIDEO |
| D-05 | **Online payments** needed (UPI/cards via a provider) or cash/UPI at clinic only? | Adds a provider, reconciliation, refunds, compliance | Record payments only (cash/UPI/card at counter) | P2-BILLING |
| D-06 | Booking trust model: **auto-confirm vs reception confirms**; is **phone OTP** required for public booking; max active future bookings per phone; cancellation cutoff (hours) | Abuse resistance vs friction; SMS OTP costs | Reception confirms (`autoConfirm=false`); no OTP but App Check + per-phone cap (2) + IP throttle; patients may cancel until 2 h before | P0-02, P1-BOOK, P1-PATIENT |
| D-07 | Should **admin** be able to read clinical notes/prescriptions/documents? | Privacy vs oversight; admin may be office staff | No (doctor-only clinical data; admin sees operations and audit) | P0-04, P2-CLINICAL |
| D-08 | Gastroenterology specifics: procedure types (endoscopy, colonoscopy…), prep instructions, procedure consent forms, biopsy/pathology tracking, recalls | Drives slot lengths, forms and follow-up tracking | Generic consult flow first; procedure module later | P2-GASTRO |
| D-09 | UI languages: English only, or add **Hindi/Punjabi**? | Layout/fonts and content workload | English only; keep strings extractable | P3-I18N |
| D-10 | Make the GitHub repo **private**? Who owns the repo/Firebase project long-term (client vs developer)? | Client data/IP; handover, access control | Private repo; client is Firebase project Owner; developer has minimal roles | SEC-09, P3-HANDOVER |
| D-11 | Does **production data** already exist (appointments, patients)? | Decides whether migration `03 §12` is needed | Assume yes until verified; export before any deploy | P0-04, P0-02 |
| D-12 | Staff **dark mode**? | Effort vs benefit; unused config today | No; remove the unused `darkMode` config | Track U |
| D-13 | Multiple doctors/branches in the near future? | Confirms multi-doctor work in P1-CONFIG is worth doing now | Design for it; single doctor UI today | P1-CONFIG |
| D-14 | Will the clinic **publish fees** and FAQs? Any restrictions on testimonials/reviews (advertising rules)? | Public content and legal exposure ⚖️ | No fees, no testimonials until counsel/client approve | P1-CONTENT |
| D-15 | Retention periods and who is the **grievance/data-request contact** (name, email, phone)? | DPDP notice and rights handling ⚖️ | Placeholder contact = clinic email; retention to be set with counsel | P1-LEGAL, P2-RIGHTS |
| D-16 | Backup targets: acceptable **data-loss window (RPO)** and **restore time (RTO)**; who receives alerts? | Backup frequency, monitoring, on-call | RPO ≤ 24 h with PITR, RTO ≤ 4 h; alerts to developer and client email | P0-07, P3-MONITORING |
| D-17 | Ongoing **support and maintenance** arrangement (who fixes bugs, updates dependencies, pays cloud costs) | A live clinical system needs an owner | Written maintenance agreement before go-live | P3-HANDOVER |
| D-18 | Expected volume (patients/day, appointments/day) and budget ceiling for cloud services | Cost forecast; alert thresholds | ≤ 100 appointments/day; budget alert at a low fixed amount agreed with the client | P0-07 |
| D-19 | Reception hardware: shared PC, tablet, or personal phones? Is a **waiting-room display** wanted? | Idle-timeout, layout, privacy of names on screens | Shared PC/tablet; no public display | Track U, P1-RECEPTION |

## Verify-in-console list (not decisions, but unknowns to confirm)

Billing plan (Spark/Blaze) · Firestore location · whether repo rules/indexes/functions match what is deployed · App Check status · API-key restrictions · whether any production data exists · Auth email templates and authorized domains · which Google account owns the project.
