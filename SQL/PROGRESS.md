# Instructions for AI CLIs

Read `SQL/PLAN.md` and the current phase execution log before changing percentages. Include all phases and overall progress in every final work report, as requested by the user. Percentages are engineering estimates against phase exit criteria, not test-pass rates or proof of production migration. Credit earlier work once; do not increase unrelated phases just because a shared schema compiled. Mark 100% only when that phase's stated milestone/exit is met. Keep local implementation and production deployment status explicit.

# SQL backend progress — 2026-10-20

| Phase | Work | Estimated completion | Remaining |
|---|---|---:|---|
| 0 | Inventory and boundaries | 80% | Actual baseline bill/trial entitlement check |
| 1 | Relational foundation | 100% | Foundation milestone complete; later schema extensions have their own release gates |
| 2 | Safe initial SQL operations | 100% | Initial authenticated/public workflow milestone complete; later modules belong below |
| 3 | Identity and staff administration | 90% | Patient-link live integration stays coupled to the Phase 5 patient cutover |
| 4 | Migration rehearsal | 89% | Real source/census and retained-domain importer, commit checkpoints, anchored history, verified ownership/legacy evidence, guest release review and full database restore policy/proof |
| 5 | Module cutovers | 10% | Contact is SQL-backed; catalog/settings/patient/public-content and full audit cutovers remain |
| 6 | SQL scheduler | 0% | Port branch logic, atomic interval protection, holds/retries/events/queue, integrations and client cutover |
| 7 | Clinical/financial/media workflows | 0% | Scoped visits/notes/documents, billing/payment, notifications and retention/export |
| 8 | Final production operation | 5% | Existing CI/releases provide groundwork; final freeze/reconciliation, full cutover, restore/rollback and resource retirement remain |

Overall estimate: **about 57%**. Planning weights for phases 0–8 are 5/10/10/15/20/10/15/10/5 percent; weighted completion is 56.55%. This is a rough scope estimate, not a measured feature count. Latest continuation credits fixed synthetic IAM atomic write/retry/rollback/logical restore plus physical read-only target capture (+4 Phase 4 points from 85, +0.8 weighted point); unrelated phases are unchanged. P4-03b/04/05 remain partial: no general production importer, trusted real source export/census, anchored commit checkpoints or full database backup restore. Assessments never grant access. Protected real imports, verified ownership/legacy evidence and guest release review remain pending.

Latest implementation: private review-only UID/list/path ownership assessment, strict synthetic Auth snapshot/risk checks, zero grants and count-only reporting; structured/scalar patient creator provenance preserved separately by two nullable local fields. Local tables: 33; last verified deployed: 22. No link, Auth authority or runtime change. Guest nullable patient FK still requires separate DDL/API/deletion review/approval or additive redesign before release. Candidates remain blocked; no real records imported. See `SQL/phase 4.md`.

Latest tooling: demo-only atomic IAM fixture changes/replay/rollback/uncertainty/logical restore; read-only consistent physical target capture for 23 fixed domain tables with actual columns/composite keys, exact UTC microseconds and encrypted-only output; oversized census refusal; and a local release-source guard. Capture → encrypt → atomic fixture change → drift comparison is tested. Rehearsal operations are UNDEPLOYED; release-check deliberately blocks those definitions/SDKs and the unreviewed guest relation. Existing inspection remains blocked/write-free; no real source, production patient mutation or new paid resource. See `SQL/migration/README.md`.

Latest checks: 276 unique passing tests (202 local SQL/migration, 60 existing unit/frontend/time/schedule, 14 Firestore permission), SQL compilation, both lints/builds and syntax/whitespace checks. Release-source command intentionally exits 1 with the three documented blockers (its tests pass). No production deployment or new paid resource. Local synthetic writes/capture are not production migration readiness.
