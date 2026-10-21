const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveAdmin } = require('./staffAuthorization');
const invalid = () => new HttpsError('invalid-argument', 'Select a valid activity page.');
const incomplete = () => new HttpsError('failed-precondition', 'The activity log needs review before it can be displayed.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function timestamp(value, error = incomplete) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw error();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function text(value, max, nullable = false) {
  if (value == null && nullable) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw incomplete();
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !uuid.test(value.toLowerCase())) throw incomplete();
  return value.toLowerCase();
}

// Operational audit projection only: ids, roles, actions and resource labels.
// No free-form metadata, search terms, patient identifiers or clinical text.
function createSqlAuditLog({ auth, store }) {
  return {
    async list(request) {
      if (!request?.app?.appId || typeof request.app.appId !== 'string' || request.app.alreadyConsumed === true) throw new HttpsError('failed-precondition', 'Reload the clinic website to verify this request.');
      const input = object(request.data ?? {}, ['cursor']);
      let cursor = null;
      if (input.cursor != null) {
        object(input.cursor, ['occurredAt']);
        cursor = { occurredAt: timestamp(input.cursor.occurredAt, invalid) };
      }
      const actor = await requireLiveAdmin(auth, request);
      if (request.auth.token.auth_time > Date.now() / 1000 + 60) throw new HttpsError('permission-denied', 'Sign in again to verify staff access.');
      try {
        const rows = await store.read({ actorUid: actor.uid, actorRole: 'admin', cursor });
        if (!Array.isArray(rows) || rows.length > 22) throw incomplete();
        // UUID filters have no lt: paginate on native microseconds with `le`,
        // then drop the exact cursor row; same-microsecond tie repeats are
        // deduplicated by the caller, and no row can be skipped.
        const remaining = cursor && rows[0] && timestamp(rows[0].occurredAt) === cursor.occurredAt ? rows.slice(1) : rows;
        if (remaining.length > 21) throw incomplete();
        const seen = new Set(); let previous = null;
        const events = remaining.slice(0, 20).map(row => {
          if (!row || typeof row !== 'object' || seen.has(row.id)) throw incomplete();
          const occurredAt = timestamp(row.occurredAt); const eventId = id(row.id);
          if (cursor && occurredAt > cursor.occurredAt) throw incomplete();
          if (previous && !(previous.occurredAt > occurredAt || (previous.occurredAt === occurredAt && previous.id > eventId))) throw incomplete();
          seen.add(eventId); previous = { occurredAt, id: eventId };
          return { id: eventId, at: occurredAt, action: text(row.action, 120), actorRole: text(row.actorRole, 40),
            actorUid: text(row.actorUid, 200, true), resourceType: text(row.resourceType, 80), resourceId: text(row.resourceId, 200) };
        });
        const last = events.at(-1);
        return { events, nextCursor: remaining.length > 20 && last ? { occurredAt: last.at } : null };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('unavailable', 'The activity log could not be loaded. Please retry.');
      }
    },
  };
}
function sqlAuditLogStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async read({ actorUid, actorRole, cursor }) {
      const response = cursor
        ? await sdk.readAdminAuditLogAfter(dc, { actorUid, actorRole, afterOccurredAt: cursor.occurredAt })
        : await sdk.readAdminAuditLog(dc, { actorUid, actorRole });
      return response.data.query.auditLogs;
    },
  };
}
function createSqlAuditLogBackend({ auth, dc }) {
  const service = createSqlAuditLog({ auth, store: sqlAuditLogStore(dc) });
  return Object.freeze({ listSqlAdminAuditLog: request => service.list(request) });
}
const { sqlPatientCallableOptions: sqlAuditLogCallableOptions } = require('./sqlPatientHandlers');
module.exports = { createSqlAuditLog, sqlAuditLogStore, createSqlAuditLogBackend, sqlAuditLogCallableOptions };
