import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { requireLiveAdmin, projectStaffIdentity, createStaffDirectory } = require('../lib/sqlStaffDirectory');

const user = (uid, role = 'admin', extra = {}) => ({ uid, displayName: `Test ${uid}`, email: `${uid}@example.test`, disabled: false, tokensValidAfterTime: '2026-10-19T00:00:00Z', customClaims: { role }, ...extra });
const request = { auth: { uid: 'admin', token: { role: 'admin', auth_time: 1792368000 } }, data: {} };

describe('live staff authority', () => {
  it('rejects unsigned, disabled, demoted, forced-password and revoked administrators', async () => {
    const cutoff = Math.floor(Date.parse('2026-10-19T00:00:00Z') / 1000);
    const currentRequest = { auth: { uid: 'admin', token: { role: 'admin', auth_time: cutoff } } };
    for (const current of [user('admin', 'admin', { disabled: true }), user('admin', 'manager'), user('admin', 'admin', { customClaims: { role: 'admin', forcePasswordChange: true } })]) {
      await expect(requireLiveAdmin({ getUser: async () => current }, currentRequest)).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await expect(requireLiveAdmin({ getUser: async () => user('admin') }, {})).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requireLiveAdmin({ getUser: async () => user('admin') }, { auth: { ...currentRequest.auth, token: { role: 'admin', auth_time: cutoff - 1 } } })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requireLiveAdmin({ getUser: async () => user('admin') }, currentRequest)).resolves.toMatchObject({ uid: 'admin' });
  });

  it('projects doctor scope from trusted claims and tombstones removed staff roles', () => {
    expect(projectStaffIdentity(user('doctor', 'doctor', { customClaims: { role: 'doctor', doctorId: 'brig-ak-sood' } }))).toMatchObject({ role: 'doctor', doctorLegacyId: 'brig-ak-sood', active: true });
    expect(projectStaffIdentity(user('doctor', 'doctor', { customClaims: { role: 'doctor' } }))).toMatchObject({ active: false });
    expect(projectStaffIdentity(user('former', undefined, { customClaims: {} }))).toMatchObject({ role: 'none', active: false, doctorLegacyId: null });
    expect(() => projectStaffIdentity({ uid: '' })).toThrow();
  });
});

describe('SQL directory reconciliation', () => {
  it('writes only changed staff, revokes removed roles, and never imports patients', async () => {
    const actor = user('admin', 'admin', { tokensValidAfterTime: '1970-01-01T00:00:00Z' });
    const users = [actor, user('patient', undefined, { customClaims: {} }), user('former', undefined, { customClaims: {} })];
    const projected = projectStaffIdentity(actor);
    const rows = new Map([[projected.uid, projected], ['former', projectStaffIdentity(user('former', 'manager'))]]);
    const write = vi.fn(async (row) => { rows.set(row.uid, row); });
    const store = {
      list: async () => [...rows.values()],
      write,
    };
    const directory = createStaffDirectory({ auth: { getUser: async () => actor, listUsers: async () => ({ users }) }, store });
    const result = await directory(request);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({ uid: 'former', role: 'none', active: false });
    expect(result.total).toBe(1);
    expect(result.staff.map((item) => item.uid)).toEqual(['admin']);
  });

  it('rejects invalid pagination before accessing Auth or SQL', async () => {
    const getUser = vi.fn();
    const directory = createStaffDirectory({ auth: { getUser }, store: {} });
    await expect(directory({ ...request, data: { limit: 0 } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(directory({ ...request, data: { cursor: 42 } })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('does not write or tombstone records after an incomplete Auth scan', async () => {
    const actor = user('admin', 'admin', { tokensValidAfterTime: '1970-01-01T00:00:00Z' });
    const write = vi.fn();
    const store = { list: async () => [projectStaffIdentity(user('missing', 'manager'))], write };
    let calls = 0;
    const directory = createStaffDirectory({
      auth: { getUser: async () => actor, listUsers: async () => {
        calls += 1;
        if (calls === 2) throw new Error('Auth temporarily unavailable');
        return { users: [actor], pageToken: 'next' };
      } }, store,
    });
    await expect(directory(request)).rejects.toThrow('Auth temporarily unavailable');
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects an old administrator session before reading SQL', async () => {
    const list = vi.fn();
    const directory = createStaffDirectory({ auth: { getUser: async () => user('admin', 'manager') }, store: { list } });
    await expect(directory(request)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(list).not.toHaveBeenCalled();
  });
});
