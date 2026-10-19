const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { fixtures, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { encodeInspectionSource, openInspectionSource } = require('../migration/protected-reader.cjs');
const records = fixtures.filter(row => !/^integrations\/|^integrationOAuthStates\//.test(row.path));

async function sandbox(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clinic-reader-'));
  await fs.chmod(dir, 0o700);
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
const decisions = page => page.records.map((_, index) => ({ index: page.start + index, disposition: 'blocked', reasons: ['MODULE_NOT_READY'] }));
const save = (file, bytes) => fs.writeFile(file, bytes, { mode: 0o600, flag: 'wx' });

test('encrypted source preserves complete unknown-field evidence without plaintext files or SQL access', async () => sandbox(async dir => {
  const key = randomBytes(32); const source = structuredClone(records);
  source[0].data.unrecognizedField = 'SYNTHETIC_PRIVATE_VALUE';
  const encrypted = encodeInspectionSource(source, { patientTargetSnapshot }, key);
  assert.ok(!encrypted.includes(Buffer.from('SYNTHETIC_PRIVATE_VALUE')));
  const file = path.join(dir, 'source.bin'); await save(file, encrypted);
  const session = await openInspectionSource(file, key);
  const page = await session.page({ limit: 500 });
  assert.deepEqual(page.records, source);
  assert.deepEqual(page.targets, { patientTargetSnapshot });
  assert.equal(page.applied, 0); assert.equal(page.readyForApply, false);
  page.records[0].data.unrecognizedField = 'changed';
  assert.equal((await session.page({ limit: 500 })).records[0].data.unrecognizedField, 'SYNTHETIC_PRIVATE_VALUE');
}));

test('checkpoint resumes an inspected page only after every ordered disposition is supplied', async () => sandbox(async dir => {
  const key = randomBytes(32); const file = path.join(dir, 'source.bin');
  await save(file, encodeInspectionSource(records, {}, key));
  const session = await openInspectionSource(file, key); const first = await session.page({ limit: 2 });
  const cp = session.checkpoint(first, decisions(first));
  assert.ok(!cp.includes(Buffer.from('fixture')));
  const checkpointPath = path.join(dir, 'checkpoint.bin'); await save(checkpointPath, cp);
  const next = await session.page({ checkpointPath, limit: 2 });
  assert.equal(next.start, 2); assert.deepEqual(next.records, records.slice(2, 4));
  const restored = await openInspectionSource(file, key);
  assert.equal((await restored.page({ checkpointPath, limit: 1 })).start, 2);
  assert.throws(() => session.checkpoint(first, decisions(first).slice(1)), /INSPECTION_PAGE_REJECTED/);
  assert.throws(() => session.checkpoint(first, decisions(first).reverse()), /INSPECTION_PAGE_REJECTED/);
  const unsafe = decisions(first); unsafe[0].disposition = 'applied';
  assert.throws(() => session.checkpoint(first, unsafe), /INSPECTION_PAGE_REJECTED/);
}));

test('tampered, wrong-key and source/target-rebound artifacts fail closed without reflecting contents', async () => sandbox(async dir => {
  const key = randomBytes(32); const file = path.join(dir, 'source.bin');
  const bytes = encodeInspectionSource(records, {}, key); await save(file, bytes);
  await assert.rejects(openInspectionSource(file, randomBytes(32)), /PROTECTED_SOURCE_REJECTED/);
  const session = await openInspectionSource(file, key); const first = await session.page({ limit: 2 });
  const checkpointPath = path.join(dir, 'checkpoint.bin'); await save(checkpointPath, session.checkpoint(first, decisions(first)));
  for (const targets of [{ patientTargetSnapshot }, {}]) {
    const changed = structuredClone(records); if (!Object.keys(targets).length) changed[0].data.displayName = 'SYNTHETIC_CHANGED';
    const otherFile = path.join(dir, `other-${Object.keys(targets).length}.bin`); await save(otherFile, encodeInspectionSource(changed, targets, key));
    await assert.rejects((await openInspectionSource(otherFile, key)).page({ checkpointPath }), /INSPECTION_CHECKPOINT_REJECTED/);
  }
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1;
  const bad = path.join(dir, 'tampered.bin'); await save(bad, corrupt);
  await assert.rejects(openInspectionSource(bad, key), error => error.message === 'PROTECTED_SOURCE_REJECTED');
}));

test('private directory/file ownership and mode, regular files and no-symlink boundary are enforced', async () => sandbox(async dir => {
  const key = randomBytes(32); const file = path.join(dir, 'source.bin'); await save(file, encodeInspectionSource(records, {}, key));
  await fs.chmod(file, 0o644); await assert.rejects(openInspectionSource(file, key), /PROTECTED_SOURCE_REJECTED/);
  await fs.chmod(file, 0o600);
  const link = path.join(dir, 'alias.bin'); await fs.symlink(file, link);
  await assert.rejects(openInspectionSource(link, key), /PROTECTED_SOURCE_REJECTED/);
  await fs.chmod(dir, 0o755); await assert.rejects(openInspectionSource(file, key), /PROTECTED_SOURCE_REJECTED/);
  await fs.chmod(dir, 0o700);
  await assert.rejects(openInspectionSource(dir, key), /PROTECTED_SOURCE_REJECTED/);
}));

test('source serialization rejects unsafe/lossy values, accessors, duplicates, excessive size and secrets', () => {
  const key = randomBytes(32);
  for (const value of [undefined, NaN, Infinity, -0, Number.MAX_SAFE_INTEGER + 1, 1n, new Date(), 'x'.repeat(100001)]) {
    const rows = structuredClone(records); rows[0].data.bad = value;
    assert.throws(() => encodeInspectionSource(rows, {}, key), /PROTECTED_SOURCE_REJECTED/);
  }
  const rows = structuredClone(records); let called = false;
  Object.defineProperty(rows[0].data, 'bad', { enumerable: true, get() { called = true; return 'private'; } });
  assert.throws(() => encodeInspectionSource(rows, {}, key), /PROTECTED_SOURCE_REJECTED/); assert.equal(called, false);
  assert.throws(() => encodeInspectionSource([...records, records[0]], {}, key), /PROTECTED_SOURCE_REJECTED/);
  assert.throws(() => encodeInspectionSource(Array(10001).fill(records[0]), {}, key), /PROTECTED_SOURCE_REJECTED/);
  assert.throws(() => encodeInspectionSource(fixtures, {}, key), /PROTECTED_SOURCE_REJECTED/);
  const secret = structuredClone(records); secret[0].data.passwordHash = 'DO_NOT_LEAK';
  assert.throws(() => encodeInspectionSource(secret, {}, key), error => error.message === 'PROTECTED_SOURCE_REJECTED');
});

test('modified page data/token and arbitrary reason payloads cannot advance inspection', async () => sandbox(async dir => {
  const key = randomBytes(32); const file = path.join(dir, 'source.bin'); await save(file, encodeInspectionSource(records, {}, key));
  const session = await openInspectionSource(file, key); const page = await session.page({ limit: 2 });
  const altered = structuredClone(page); altered.records[0].path = 'DO_NOT_LEAK';
  assert.throws(() => session.checkpoint(altered, decisions(page)), /INSPECTION_PAGE_REJECTED/);
  const reasons = decisions(page); reasons[0].reasons = ['Patient name or clinical text'];
  assert.throws(() => session.checkpoint(page, reasons), /INSPECTION_PAGE_REJECTED/);
  const corrupted = { ...page, token: Buffer.from(page.token) }; corrupted.token[20] ^= 1;
  assert.throws(() => session.checkpoint(corrupted, decisions(page)), /INSPECTION_PAGE_REJECTED/);
  for (const limit of [0, 501, 1.5, '2']) await assert.rejects(session.page({ limit }), /INSPECTION_PAGE_REJECTED/);
}));

test('empty/end-of-input inspection is explicit, never an applied/complete migration', async () => sandbox(async dir => {
  const key = randomBytes(32); const file = path.join(dir, 'empty.bin'); await save(file, encodeInspectionSource([], {}, key));
  const session = await openInspectionSource(file, key); const page = await session.page();
  assert.equal(page.done, true); assert.equal(page.applied, 0); assert.equal(page.readyForApply, false);
  assert.throws(() => session.checkpoint(page, []), /INSPECTION_PAGE_REJECTED/);
}));

test('code revision and randomized encryption remain stable/reproducible at the plaintext contract level', async () => sandbox(async dir => {
  const key = randomBytes(32); const a = encodeInspectionSource(records, {}, key); const b = encodeInspectionSource(records, {}, key);
  assert.notDeepEqual(a, b);
  const fileA = path.join(dir, 'a.bin'); const fileB = path.join(dir, 'b.bin'); await save(fileA, a); await save(fileB, b);
  const first = await openInspectionSource(fileA, key); const second = await openInspectionSource(fileB, key);
  assert.equal(first.revision, second.revision); assert.match(first.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual((await first.page({ limit: 500 })).records, (await second.page({ limit: 500 })).records);
}));
