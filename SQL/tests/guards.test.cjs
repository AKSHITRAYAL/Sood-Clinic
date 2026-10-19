const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localDataConnect } = require('../scripts/local.cjs');

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
