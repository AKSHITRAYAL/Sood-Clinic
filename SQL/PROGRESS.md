# Instructions for AI CLIs

Read `SQL/PLAN.md` and the current phase execution log before changing percentages. Include all phases and overall progress in every final work report, as requested by the user. Percentages are engineering estimates against phase exit criteria, not test-pass rates or proof of production migration. Credit earlier work once; do not increase unrelated phases just because a shared schema compiled. Mark 100% only when that phase's stated milestone/exit is met. Keep local implementation and production deployment status explicit.

# SQL backend progress — 2026-10-19

| Phase | Work | Estimated completion | Remaining |
|---|---|---:|---|
| 0 | Inventory and boundaries | 80% | Actual baseline bill/trial entitlement check |
| 1 | Relational foundation | 100% | Foundation milestone complete; later schema extensions have their own release gates |
| 2 | Safe initial SQL operations | 100% | Initial authenticated/public workflow milestone complete; later modules belong below |
| 3 | Identity and staff administration | 90% | Patient-link live integration stays coupled to the Phase 5 patient cutover |
| 4 | Migration rehearsal | 72% | Protected retained-source/reader/checkpoint/content contract, real ownership/evidence/census reconciliation, guest release review, atomic timestamp/version imports, idempotent apply and restore |
| 5 | Module cutovers | 10% | Contact is SQL-backed; catalog/settings/patient/public-content and full audit cutovers remain |
| 6 | SQL scheduler | 0% | Port branch logic, atomic interval protection, holds/retries/events/queue, integrations and client cutover |
| 7 | Clinical/financial/media workflows | 0% | Scoped visits/notes/documents, billing/payment, notifications and retention/export |
| 8 | Final production operation | 5% | Existing CI/releases provide groundwork; final freeze/reconciliation, full cutover, restore/rollback and resource retirement remain |

Overall estimate: **about 53%**. Planning weights for phases 0–8 are 5/10/10/15/20/10/15/10/5 percent; weighted completion is 53.15%. This is a rough scope estimate, not a measured feature count. Latest revision credits review-only ownership checks and creator-provenance preservation/tests (+3 Phase 4 points, +0.6 weighted point); unrelated phases are unchanged. Assessments never grant access. Protected imports, real ownership/evidence reconciliation and guest release review remain pending.

Latest implementation: private review-only UID/list/path ownership assessment, strict synthetic Auth snapshot/risk checks, zero grants and count-only reporting; structured/scalar patient creator provenance preserved separately by two nullable local fields. Local tables: 33; last verified deployed: 22. No link, Auth authority or runtime change. Guest nullable patient FK still requires separate DDL/API/deletion review/approval or additive redesign before release. Candidates remain blocked; no real records imported. See `SQL/phase 4.md`.

Latest checks: 220 unique passing tests (146 local SQL/migration, 60 existing unit/frontend/time/schedule, 14 Firestore permission), SQL compilation, both lints/builds and syntax/whitespace checks. No production deployment or new paid resource.
