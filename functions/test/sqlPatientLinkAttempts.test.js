import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlPatientLinkAttemptGuard } = require('../lib/sqlPatientLinkAttempts');

const auditId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const response = patch => ({ data: { user_updateMany: 1, auditLog_insert: { id: auditId }, ...patch } });
const setup = (consumeAttempt = vi.fn(async () => response())) => ({ consumeAttempt, guard: createSqlPatientLinkAttemptGuard({ consumeAttempt }) });

test('a valid debit admits the attempt and forwards only the actor UID', async () => {
  const { consumeAttempt, guard } = setup();
  await expect(guard({ actorUid: 'synthetic-patient', appId: 'synthetic-app' })).resolves.toBe(true);
  expect(consumeAttempt).toHaveBeenCalledWith({ actorUid: 'synthetic-patient' });
  expect(Object.keys(consumeAttempt.mock.calls[0][0])).toEqual(['actorUid']);
});

test('a saturated window rejects without retry while malformed responses fail closed', async () => {
  const limited = setup(); limited.consumeAttempt.mockRejectedValue(new Error('LINK_ATTEMPT_LIMIT'));
  await expect(limited.guard({ actorUid: 'synthetic-patient', appId: 'synthetic-app' })).resolves.toBe(false);
  for (const consumeAttempt of [
    vi.fn(async () => ({ data: { user_updateMany: 0, auditLog_insert: { id: auditId } } })),
    vi.fn(async () => ({ data: { user_updateMany: 1, auditLog_insert: {} } })),
    vi.fn(async () => ({ data: { user_updateMany: 1, auditLog_insert: { id: 'not-a-uuid' } } })),
    vi.fn(async () => ({ data: { user_updateMany: 1 } })),
    vi.fn(async () => { throw new Error('private SQL detail'); }),
    vi.fn(async () => { throw { message: 7 }; }),
  ]) {
    const { guard } = setup(consumeAttempt);
    await expect(guard({ actorUid: 'synthetic-patient', appId: 'synthetic-app' })).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private') });
  }
});

test('invalid or over-specified inputs never reach the debit', async () => {
  const { consumeAttempt, guard } = setup();
  for (const input of [null, [], {}, { actorUid: '', appId: 'app' }, { actorUid: 'user', appId: '' }, { actorUid: 'user with space', appId: 'app' }, { actorUid: 'user', appId: 'app', ip: '127.0.0.1' }, { actorUid: 'user', code: 'C'.repeat(43) }]) {
    await expect(guard(input)).rejects.toMatchObject({ code: 'unavailable' });
  }
  expect(consumeAttempt).not.toHaveBeenCalled();
});
