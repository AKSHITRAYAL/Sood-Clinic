const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, readdirSync } = require('node:fs');
const { manifest, inspectRecord, mapCatalogRecord, legacyUuid, validDate, validTimestamp, paise, rehearse } = require('../migration/rehearsal.cjs');
const { fixtures } = require('../migration/fixtures.cjs');

test('synthetic manifest fixtures cover every declared category without claiming migration readiness', () => {
  assert.deepEqual([...new Set(fixtures.map(record => inspectRecord(record).category))].sort(), Object.keys(manifest).sort());
  for (const record of fixtures) assert.equal(inspectRecord(record).status, 'recognized');
  const report = rehearse(fixtures);
  assert.equal(report.total, fixtures.length);
  assert.equal(report.writes, 0);
  assert.ok(report.deferred > 0);
  assert.equal(report.mapped, 3);
  assert.equal(report.readyForApply, 0);
});

test('unknown fields/subcollections and malformed nested structures fail closed without reflecting values', () => {
  const record = fixtures.find(record => record.path === 'branches/fixture-branch');
  for (const altered of [
    { ...record, path: 'patients/private-name/unexpected/private-record' },
    { ...record, data: { ...record.data, 'secret-patient-name': 'private-health-text' } },
    { ...record, data: { ...record.data, address: { ...record.data.address, undocumented: 'private' } } },
    { ...record, data: { ...record.data, address: 'silently flattened address' } },
    { ...record, path: 'branches/../fixture-branch' },
  ]) {
    const result = inspectRecord(altered);
    assert.equal(result.status, 'rejected');
    assert.doesNotMatch(JSON.stringify(result), /private|secret-patient|undocumented|silently/);
  }
});

test('catalog mapping is deterministic, namespaced and preserves every source field in a private review envelope', () => {
  const branch = fixtures.find(record => record.path === 'branches/fixture-branch');
  const result = mapCatalogRecord(branch, fixtures);
  assert.equal(result.status, 'mapped');
  assert.equal(result.readyForApply, false);
  assert.equal(result.rows.branch.legacyId, 'fixture-branch');
  assert.equal(result.rows.branch.id, legacyUuid('branch', 'fixture-branch'));
  assert.equal(result.rows.branch.id, '15e8eb15-47fa-8787-9889-04b84659dee8');
  assert.notEqual(legacyUuid('doctor', 'fixture-branch'), result.rows.branch.id);
  assert.deepEqual(result.source, branch);
  assert.deepEqual(result, mapCatalogRecord(branch, [...fixtures].reverse()));
  assert.notEqual(result.rows.branch.id, legacyUuid('branch', 'fixture-other'));
  assert.match(result.rows.branch.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('catalog dependency, duplicate-ID/code and missing-required-field cases cannot silently apply', () => {
  const department = fixtures.find(record => record.path === 'departments/fixture-department');
  const doctor = fixtures.find(record => record.path === 'doctors/fixture-doctor');
  assert.equal(mapCatalogRecord(department, [department]).reason, 'MISSING_REFERENCE');
  assert.equal(mapCatalogRecord(doctor, [doctor]).reason, 'MISSING_REFERENCE');
  assert.equal(mapCatalogRecord(department, [...fixtures, department]).reason, 'DUPLICATE_SOURCE');
  const bad = { ...department, data: { ...department.data, code: '' } };
  assert.equal(mapCatalogRecord(bad, fixtures.filter(record => record.path !== department.path).concat(bad)).reason, 'REQUIRED_FIELD');
  const branch = fixtures.find(record => record.path === 'branches/fixture-branch');
  const duplicateCode = { ...branch, path: 'branches/second-branch' };
  assert.equal(mapCatalogRecord(branch, [...fixtures, duplicateCode]).reason, 'DUPLICATE_CODE');
  const wrongBranch = { ...department, data: { ...department.data, branchId: 'different-branch' } };
  assert.equal(mapCatalogRecord(doctor, fixtures.filter(record => record !== department).concat(wrongBranch)).reason, 'MISSING_REFERENCE');
  const invalidBranch = { ...branch, data: { ...branch.data, active: 'true' } };
  assert.equal(mapCatalogRecord(department, fixtures.filter(record => record !== branch).concat(invalidBranch)).reason, 'MISSING_REFERENCE');
});

test('real dates, timestamp precision and integer money are validated without coercion', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const value of ['2025-02-29', '2026-02-31', '2026-13-01', '2026-1-01', '', null]) assert.equal(validDate(value), false);
  assert.equal(validTimestamp('2026-10-18T18:30:00.000Z'), true);
  assert.equal(validTimestamp({ seconds: 1792348200, nanoseconds: 123456789 }), true);
  for (const value of ['2026-02-31T00:00:00Z', '2026-10-19', { seconds: 1, nanoseconds: 1e9 }, { seconds: 1, nanoseconds: 0, extra: 'secret' }]) assert.equal(validTimestamp(value), false);
  assert.equal(paise(25000), 25000);
  for (const value of [1.5, -1, '25000', Infinity, NaN, 2147483648, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => paise(value), /INVALID_MONEY/);
});

test('patient contact matches and UID-looking document IDs never become access grants', () => {
  const patient = fixtures.find(record => record.path === 'patients/fixture-account');
  assert.equal(inspectRecord(patient).disposition, 'deferred');
  assert.equal(mapCatalogRecord(patient, fixtures).reason, 'MODULE_NOT_READY');
  assert.ok(!Object.hasOwn(rehearse([patient]), 'rows'));
});

test('dry-run count reports are stable across page sizes, omit identifiers and never label rejected rows ready', () => {
  const report = rehearse(fixtures, { pageSize: 2 });
  const again = rehearse([...fixtures].reverse(), { pageSize: 7 });
  assert.equal(report.total, again.total);
  assert.deepEqual(report.counts, again.counts);
  assert.doesNotMatch(JSON.stringify(report), /fixture-account|example\.test|Synthetic|0000000000|rows|checkpoint/);
  const record = { source: 'firestore', path: 'unknown/private', data: { health: 'must not leak' } };
  assert.equal(rehearse([record]).rejected, 1);
  assert.doesNotMatch(JSON.stringify(rehearse([record])), /private|health|must not leak/);
  assert.throws(() => rehearse(fixtures, { pageSize: 0 }), /INVALID_PAGE_SIZE/);
});

test('CLI is fixture-only and refuses production, external database settings and arbitrary input paths', () => {
  // No inherited credentials, emulator-injected DB overrides or node:test protocol.
  const run = (args = [], extra = {}) => spawnSync(process.execPath, ['SQL/scripts/rehearse.cjs', ...args], { cwd: process.cwd(), encoding: 'utf8', env: { GCLOUD_PROJECT: 'demo-sood-clinic', ...extra } });
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).writes, 0);
  for (const [args, env] of [[[], { GCLOUD_PROJECT: 'sood-clinic' }], [[], { FIREBASE_DATACONNECT_POSTGRESQL_STRING: 'postgresql://private' }], [['--input', '/tmp/private-records'], {}], [['--apply'], {}]]) {
    const denied = run(args, env);
    assert.notEqual(denied.status, 0);
    assert.doesNotMatch(denied.stdout + denied.stderr, /postgresql|private-records|sood-clinic|\/tmp/);
  }
});

test('manifest accounts for literal collection references in the current runtime source', () => {
  const files = ['functions/index.js', ...readdirSync('Frontend/src', { recursive: true }).filter(path => /\.(jsx?|tsx?)$/.test(path) && !path.includes('.test.')).map(path => `Frontend/src/${path}`)];
  const declared = new Set(Object.values(manifest).filter(spec => spec.source === 'firestore').flatMap(spec => spec.path.split('/').filter((part, index) => index % 2 === 0)));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bcollection\((?:firestore,\s*)?['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) assert.equal(declared.has(match[1]), true, 'A source collection needs manifest review.');
  }
});
