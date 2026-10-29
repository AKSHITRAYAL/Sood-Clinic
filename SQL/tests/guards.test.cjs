const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localDataConnect } = require('../scripts/local.cjs');
const { rehearseBranchStep } = require('../scripts/rehearse-branch.cjs');
const { captureLocalTargets } = require('../scripts/capture-local-targets.cjs');

test('transaction rehearsal refuses absent/local-looking cloud project settings before any write', async () => {
  const original = { ...process.env };
  const keys = ['DATA_CONNECT_EMULATOR_HOST', 'FIREBASE_DATA_CONNECT_EMULATOR_HOST', 'GCLOUD_PROJECT', 'FIREBASE_DATACONNECT_POSTGRESQL_STRING'];
  try {
    for (const [host, project, connection] of [[undefined, 'demo-sood-clinic', undefined], ['cloud.example:9399', 'demo-sood-clinic', undefined], ['127.0.0.1:9399', 'sood-clinic', undefined], ['127.0.0.1:9399', 'demo-sood-clinic', 'postgres://external.example/private']]) {
      for (const key of keys) delete process.env[key];
      if (host) process.env.DATA_CONNECT_EMULATOR_HOST = host;
      process.env.GCLOUD_PROJECT = project;
      if (connection) process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING = connection;
      await assert.rejects(rehearseBranchStep({}), /Refusing SQL fixtures|REHEARSAL_ENVIRONMENT_REJECTED/);
      await assert.rejects(captureLocalTargets(Buffer.alloc(32)), /Refusing SQL fixtures|LOCAL_SNAPSHOT_REJECTED/);
    }
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});

test('fixture guard refuses absent emulator, cloud hosts and production project', () => {
  const original = { ...process.env };
  try {
    for (const [host, project] of [[undefined, 'demo-sood-clinic'], ['example.com:9399', 'demo-sood-clinic'], ['127.0.0.1:9399', 'sood-clinic']]) {
      delete process.env.DATA_CONNECT_EMULATOR_HOST;
      delete process.env.FIREBASE_DATA_CONNECT_EMULATOR_HOST;
      if (host) process.env.DATA_CONNECT_EMULATOR_HOST = host;
      process.env.GCLOUD_PROJECT = project;
      assert.throws(() => localDataConnect(), /Refusing SQL fixtures/);
    }
  } finally {
    for (const key of ['DATA_CONNECT_EMULATOR_HOST', 'FIREBASE_DATA_CONNECT_EMULATOR_HOST', 'GCLOUD_PROJECT']) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test('booking-config seeder reports unconfirmed values and keeps the template unappliable', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { readManifest } = require('../scripts/seed-booking-config.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-manifest-'));
  const file = path.join(dir, 'confirmed.json');
  const settings = { bookingWindowDays: 14, leadMinutes: 30, intervalMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, cancelCutoffMinutes: 120, autoConfirm: false };
  try {
    fs.writeFileSync(file, JSON.stringify({ clinicSettings: settings, services: [] }));
    assert.deepEqual(readManifest(file).unconfirmed, []);
    assert.throws(() => { fs.writeFileSync(file, JSON.stringify({ clinicSettings: settings, services: [], unconfirmed: [7] })); readManifest(file); }, /INVALID_MANIFEST/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // The checked-in template must never be apply-ready by accident.
  assert.ok(readManifest(path.resolve(__dirname, '../release/booking-config.template.json')).unconfirmed.length >= 8);
});

test('local target capture rejects invalid encryption keys before connecting to SQL', async () => {
  const keys = ['DATA_CONNECT_EMULATOR_HOST', 'GCLOUD_PROJECT', 'FIREBASE_DATACONNECT_POSTGRESQL_STRING'];
  const original = { ...process.env };
  try {
    process.env.DATA_CONNECT_EMULATOR_HOST = '127.0.0.1:9399'; process.env.GCLOUD_PROJECT = 'demo-sood-clinic'; delete process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING;
    for (const key of [undefined, 'not-a-key', Buffer.alloc(31)]) await assert.rejects(captureLocalTargets(key), /LOCAL_SNAPSHOT_REJECTED/);
  } finally {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
