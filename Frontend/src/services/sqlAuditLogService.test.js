import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlAuditLogService } from './sqlAuditLogService';

const fail = 'The activity log is unavailable. Refresh before continuing.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = n => `2026-10-20T04:${String(n).padStart(2, '0')}:00.000000Z`;
const row = (n, patch = {}) => ({
  id: id(n), at: at(n), action: 'patient_searched', actorRole: 'admin',
  actorUid: 'synthetic-admin', resourceType: 'patient', resourceId: 'SYNTHETIC-UHID', ...patch,
});
beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('the first page sends an empty payload and returns only whitelisted fields', async () => {
  invoke.mockResolvedValue({ data: { events: [row(2), row(1, { actorUid: undefined })], nextCursor: null } });
  const result = await sqlAuditLogService.list();
  expect(names).toEqual(['listSqlAdminAuditLog']);
  expect(invoke).toHaveBeenCalledWith({});
  expect(result.events[1].actorUid).toBeNull();
  expect(Object.keys(result.events[0]).sort()).toEqual(['action', 'actorRole', 'actorUid', 'at', 'id', 'resourceId', 'resourceType']);
  expect(result.nextCursor).toBeNull();
});

test('a cursor request forwards only the occurred-at instant and echoes the returned cursor', async () => {
  invoke.mockResolvedValue({ data: { events: [row(4, { at: at(3) })], nextCursor: { occurredAt: at(3), id: 'ignored' } } });
  const result = await sqlAuditLogService.list({ occurredAt: at(4), id: id(9) });
  expect(invoke).toHaveBeenCalledWith({ cursor: { occurredAt: at(4) } });
  expect(result.nextCursor).toEqual({ occurredAt: at(3) });
});

test('invalid cursors and malformed pages fail before any further rendering', async () => {
  for (const cursor of [{ occurredAt: '2026-10-20 04:00:00Z' }, { occurredAt: '2026-10-20T04:00:00.1234567Z' }, { occurredAt: 'nope' }, { occurredAt: '2026-13-20T04:00:00.000000Z' }, { id: id(1) }]) {
    await expect(sqlAuditLogService.list(cursor)).rejects.toThrow(fail);
  }
  expect(invoke).not.toHaveBeenCalled();

  for (const data of [
    undefined, {}, { events: 'x' }, { events: Array.from({ length: 21 }, (_, index) => row(21 - index)) },
    { events: [row(1, { id: 'not-a-uuid' })] },
    { events: [row(1, { at: '2026-10-20T04:00:00.000000+05:30' })] },
    { events: [row(1, { action: '' })] },
    { events: [row(1, { action: 'a'.repeat(121) })] },
    { events: [row(1, { action: 'patient\u0007search' })] },
    { events: [row(1, { actorRole: 'administrator'.repeat(4) })] },
    { events: [row(1, { resourceType: '' })] },
    { events: [row(1, { resourceId: 'x'.repeat(201) })] },
    { events: [row(1, { actorUid: 7 })] },
    { events: [row(1), row(1)] },
    { events: [row(1), row(2)] },
  ]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlAuditLogService.list()).rejects.toThrow(fail);
  }
});

test('the cursor must point at the last returned row, and empty pages carry no cursor', async () => {
  invoke.mockResolvedValue({ data: { events: [row(2), row(1)], nextCursor: { occurredAt: at(2) } } });
  await expect(sqlAuditLogService.list()).rejects.toThrow(fail);
  invoke.mockResolvedValue({ data: { events: [], nextCursor: { occurredAt: at(1) } } });
  await expect(sqlAuditLogService.list()).rejects.toThrow(fail);
  invoke.mockResolvedValue({ data: { events: [], nextCursor: null } });
  await expect(sqlAuditLogService.list()).resolves.toEqual({ events: [], nextCursor: null });
});

test('equal instants are accepted in any order but ascending instants are refused', async () => {
  invoke.mockResolvedValue({ data: { events: [row(1, { id: id(2) }), row(1, { id: id(1) })], nextCursor: null } });
  expect((await sqlAuditLogService.list()).events.map(event => event.id)).toEqual([id(2), id(1)]);
  invoke.mockResolvedValue({ data: { events: [row(1), row(1, { at: at(2), id: id(2) })], nextCursor: null } });
  await expect(sqlAuditLogService.list()).rejects.toThrow(fail);
});

test('a provider rejection propagates and never becomes cached content', async () => {
  invoke.mockRejectedValue(new Error('synthetic provider failure'));
  await expect(sqlAuditLogService.list()).rejects.toThrow('synthetic provider failure');
});
