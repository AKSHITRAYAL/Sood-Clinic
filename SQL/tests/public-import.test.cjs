const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('../migration/fixtures.cjs');
const { decode, buildPublicImport, insertStatements, sourceDigest } = require('../scripts/migrate-public-catalog.cjs');
const encode = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
};
function source() {
  return Object.fromEntries(['branches', 'departments', 'doctors'].map(name => [name, { documents: fixtures.filter(row => row.path.startsWith(`${name}/`)).map(row => ({ name: `projects/sood-clinic/databases/(default)/documents/${row.path}`, fields: encode(row.data).mapValue.fields, createTime: '2026-10-20T00:00:00Z', updateTime: '2026-10-20T00:00:00Z' })) }]));
}
test('public import uses validated deterministic catalogue identities and current runtime booking settings', () => {
  const input = source();
  input.doctors.documents[0].fields.role = encode('doctor');
  input.doctors.documents[0].fields.userId = encode('synthetic-doctor-account');
  const rows = buildPublicImport(input, '2026-11-01T00:00:00Z');
  assert.equal(rows.branch.length, 1);
  assert.equal(rows.doctor.length, 1);
  assert.equal(rows.services.length, 2);
  assert.equal(rows.doctorServices.length, 2);
  assert.equal(rows.clinicSettings[0].bookingWindowDays, 14);
  assert.ok(rows.legacySourceInstants.length > 0);
  assert.equal(Object.hasOwn(rows.doctor[0], 'role'), false);
  assert.equal(Object.hasOwn(rows.doctor[0], 'userId'), false);
  assert.deepEqual(buildPublicImport(input, '2026-11-01T00:00:00Z'), rows);
  const statements = insertStatements(rows);
  assert.ok(statements.every(row => row.text.startsWith('INSERT INTO clinic_') && row.text.includes('$1') && Array.isArray(row.values)));
  assert.ok(statements.every(row => !row.text.includes('Synthetic')));
});
test('partial sources, foreign projects and unexpected role hints refuse before any SQL', () => {
  const incomplete = source(); incomplete.branches.nextPageToken = 'more';
  assert.throws(() => buildPublicImport(incomplete, '2026-11-01T00:00:00Z'), /INCOMPLETE/);
  const foreign = source(); foreign.doctors.documents[0].name = 'projects/other/databases/(default)/documents/doctors/x';
  assert.throws(() => buildPublicImport(foreign, '2026-11-01T00:00:00Z'), /TARGET_MISMATCH/);
  const role = source(); role.doctors.documents[0].fields.role = encode('admin');
  assert.throws(() => buildPublicImport(role, '2026-11-01T00:00:00Z'), /ROLE_REVIEW/);
  assert.throws(() => decode({ bytesValue: 'unsupported' }), /UNSUPPORTED/);
});
test('source comparison ignores REST field ordering but detects actual edits', () => {
  assert.equal(sourceDigest({ fields: { a: 1, b: 2 }, version: 'x' }), sourceDigest({ version: 'x', fields: { b: 2, a: 1 } }));
  assert.notEqual(sourceDigest({ fields: { a: 1 }, version: 'x' }), sourceDigest({ fields: { a: 2 }, version: 'x' }));
});
