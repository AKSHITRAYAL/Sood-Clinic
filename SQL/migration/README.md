# Instructions for AI CLIs

Read `AGENTS.md`, `SQL/PLAN.md` and `SQL/phase 4.md` before changing this directory. These files are local rehearsal tools, not production migration commands. Do not replace fixtures with real data, add cloud credentials, bypass a guard or add an apply flag. Preserve the explicit unknown-field and default-deny behavior.

# Local rehearsal

From `/home/keshu/Projects/hospital-management-system`:

```bash
npm run test:migration
npm run sql:rehearse
```

Neither command needs a cloud login, running emulator or new package. `sql:rehearse` reads only the built-in synthetic fixtures and prints fixed category/reason counts. It has no SDK imports, input-path argument, network calls, file output or database writes. Cloud project/DB overrides and all CLI arguments are refused. Test subprocess execution needs a normal local shell; restricted sandboxes may deny it with EPERM. Do not skip the test or weaken the CLI guard in response.

`sql:test` also runs these tests alongside the real local Auth/SQL integration suite. CI runs the focused rehearsal first for fast feedback. No remote CI is triggered merely by running these commands.

## What is implemented

- `manifest.cjs`: 25 inventoried source categories, exact allowed leaf paths and explicit dispositions. Unknown subcollections/fields, wrong nested shapes, excessive nesting and unsupported values are rejected. Recognition means the source shape is understood; it does not mean its values are authorized, valid for SQL or mapped.
- `fixtures.cjs`: one independent synthetic example for every category. Negative examples live in tests; runtime collection references are checked against manifest paths to flag inventory drift.
- `rehearsal.cjs`: pure inspection, bounded in-memory pages, canonical new-entity UUID candidates, basic date/timestamp/paise checks and branch/department/doctor candidate projections with explicit references. No patient/contact matching or role grants. A full source envelope is retained only in the mapper's private memory result; it is never printed by the report.
- `scripts/rehearse.cjs`: fixed-fixture-only, count-only dry run. `readyForApply` and `writes` are always zero. The three mapped catalogue projections are not approved imports. Known but unmapped provenance, structured addresses, department descriptions and legacy doctor schedule fields still need a lossless storage decision.

## Important limits — do not hide them

The runner does not read real exports, stream an unbounded dataset, store checkpoints, apply SQL mutations, calculate private content checksums or rehearse a restore. These are the next Phase 4 tasks, not features implied by a successful report. In-memory lookup is bounded at 10,000 records, with pages up to 500 and a per-record complexity guard; it is not a production importer.

New-entity IDs use SHA-256 of JSON `["sood-clinic-migration-v1", entityKind, legacyId]`, first 16 bytes, with UUID version 8/variant bits. A fixed test vector prevents accidental algorithm changes. This is an application-specific deterministic ID, not a standard UUIDv5 implementation. For nested entities the eventual mapper must use the full qualified legacy path, not an ambiguous child ID alone. Existing SQL rows, including foundation catalogue rows, must reuse their already assigned IDs by unique `legacyId`; the current candidate mapper does not query or reconcile existing target rows. Never overwrite those IDs with newly derived UUIDs.

Date/timestamp utilities validate explicit UTC ISO strings or `{seconds,nanoseconds}` without rounding away nanoseconds; date-only values are not accepted as instants. Money must already be nonnegative integer paise within SQL Connect's signed 32-bit Int range. There is no implicit conversion from rupees, floats or numeric strings. These utilities are not yet a complete validator for deferred clinical/appointment entities.

Reports deliberately contain no source IDs, names, phones, email, health text, token hashes, row payloads or raw errors. Do not add per-row logging to troubleshoot real data. A future private reconciliation report/checkpoint needs the protected storage policy from the Phase 4 plan.
