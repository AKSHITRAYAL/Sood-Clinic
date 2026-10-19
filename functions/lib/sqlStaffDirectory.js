const { HttpsError } = require('firebase-functions/v2/https');
const { isDoctorId, isStaffRole, normalizeEmail } = require('./staffAccess');

const validAfter = (user) => {
  const value = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  if (!Number.isFinite(value)) throw new Error('Invalid Auth session cutoff.');
  return Math.floor(value / 1000);
};

const { requireLiveAdmin } = require('./staffAuthorization');

function projectStaffIdentity(user) {
  if (typeof user.uid !== 'string' || !user.uid.length || user.uid.length > 128) throw new Error('Invalid staff identity.');
  const role = isStaffRole(user.customClaims?.role) ? user.customClaims.role : 'none';
  const doctorLegacyId = role === 'doctor' && isDoctorId(user.customClaims?.doctorId) ? user.customClaims.doctorId : null;
  return {
    uid: user.uid,
    name: String(user.displayName || 'Staff member').trim().slice(0, 160) || 'Staff member',
    email: normalizeEmail(user.email), role, doctorLegacyId,
    accountActive: !user.disabled,
    active: !user.disabled && role !== 'none' && (role !== 'doctor' || doctorLegacyId !== null),
    requiresPasswordChange: user.customClaims?.forcePasswordChange === true,
    sessionValidAfterSeconds: String(validAfter(user)),
  };
}

function createStaffDirectory({ auth, store }) {
  return async (request) => {
    const data = request.data || {};
    const { cursor = '', limit = 50 } = data;
    if (typeof data !== 'object' || Array.isArray(data) || typeof cursor !== 'string' || cursor.length > 128 || !Number.isInteger(limit) || limit < 1 || limit > 100
      || Object.keys(data).some((key) => !['cursor', 'limit'].includes(key))) {
      throw new HttpsError('invalid-argument', 'Choose a valid staff directory page.');
    }
    const actor = await requireLiveAdmin(auth, request);
    const existing = await store.list();
    const previous = new Map(existing.map((row) => [row.uid, row]));
    const seen = new Set();
    const candidates = [];
    let pageToken;
    let pages = 0;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const user of page.users) {
        seen.add(user.uid);
        if (isStaffRole(user.customClaims?.role) || previous.has(user.uid)) candidates.push(projectStaffIdentity(user));
      }
      pageToken = page.pageToken;
      pages += 1;
      if (pages >= 10 && pageToken) throw new HttpsError('resource-exhausted', 'The staff directory needs a larger reconciliation window.');
    } while (pageToken);
    // Finish the Auth scan before tombstoning missing users or writing any rows.
    for (const row of existing) {
      if (!seen.has(row.uid)) candidates.push({ ...row, role: 'none', active: false, accountActive: false, doctorLegacyId: null });
    }
    // shortcut: cap this single-request reconciliation at 1,000 retained staff rows; use a checkpointed job beyond that.
    if (candidates.length > 1000) throw new HttpsError('resource-exhausted', 'The staff directory needs a larger reconciliation window.');
    let updated = 0;
    for (const row of candidates) {
      const old = previous.get(row.uid);
      if (!old || Object.keys(row).some((key) => old[key] !== row[key])) {
        await store.write(row, actor.uid);
        updated += 1;
      }
    }
    const rows = (await store.list()).filter((row) => isStaffRole(row.role)).sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
    const page = rows.filter((row) => row.uid > cursor).slice(0, limit + 1);
    return {
      staff: page.slice(0, limit).map((row) => ({ uid: row.uid, name: row.name, email: row.email, role: row.role, doctorId: row.doctorLegacyId, active: row.active, requiresPasswordChange: row.requiresPasswordChange })),
      total: rows.length,
      nextCursor: page.length > limit ? page[limit - 1].uid : null,
      updated,
    };
  };
}

const fromSql = (row) => ({
  uid: row.user.id, name: row.user.displayName, accountActive: row.user.active,
  email: row.email, role: row.role, doctorLegacyId: row.doctorLegacyId,
  active: row.active, requiresPasswordChange: row.requiresPasswordChange,
  sessionValidAfterSeconds: String(row.sessionValidAfterSeconds),
});

function sqlStaffStore(dc) {
  const { listStaffIdentityPage, upsertStaffIdentity } = require('../generated/sql');
  return {
    async list() {
      const rows = [];
      let cursor = '';
      do {
        const { data } = await listStaffIdentityPage(dc, { afterUid: cursor, limit: 100 });
        rows.push(...data.staffProfiles.map(fromSql));
        if (rows.length > 1000) throw new HttpsError('resource-exhausted', 'The staff directory needs a larger reconciliation window.');
        if (data.staffProfiles.length < 100) return rows;
        cursor = rows[rows.length - 1].uid;
      } while (rows.length <= 1000);
      throw new HttpsError('resource-exhausted', 'The staff directory needs a larger reconciliation window.');
    },
    async write(row, actorUid) { await upsertStaffIdentity(dc, { ...row, actorUid }); },
  };
}

module.exports = { requireLiveAdmin, projectStaffIdentity, createStaffDirectory, sqlStaffStore };
