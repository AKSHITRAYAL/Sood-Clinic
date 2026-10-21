import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const fail = () => new Error('The activity log is unavailable. Refresh before continuing.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const canonical = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
const label = (value, max, nullable = false) => {
  if (value == null && nullable) return null;
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
};
export const sqlAuditLogService = {
  async list(nextCursor = null) {
    if (nextCursor != null && !instant(nextCursor.occurredAt)) throw fail();
    const payload = nextCursor ? { cursor: { occurredAt: nextCursor.occurredAt } } : {};
    const { data } = await httpsCallable(functions, 'listSqlAdminAuditLog')(payload);
    if (!data || !Array.isArray(data.events) || data.events.length > 20) throw fail();
    const ids = new Set(); let previous = null;
    const events = data.events.map(row => {
      if (!row || typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id.toLowerCase()) || !instant(row.at)
        || !label(row.action, 120) || !label(row.actorRole, 40) || !label(row.resourceType, 80) || !label(row.resourceId, 200)
        || !label(row.actorUid, 200, true)) throw fail();
      if (previous && canonical(previous) < canonical(row.at)) throw fail();
      previous = row.at;
      ids.add(row.id.toLowerCase());
      return { id: row.id, at: row.at, action: row.action, actorRole: row.actorRole, actorUid: row.actorUid ?? null,
        resourceType: row.resourceType, resourceId: row.resourceId };
    });
    const position = data.nextCursor;
    if (position != null && (!instant(position.occurredAt) || !events.length || position.occurredAt !== events.at(-1).at)) throw fail();
    return { events, nextCursor: position == null ? null : { occurredAt: position.occurredAt } };
  },
};
