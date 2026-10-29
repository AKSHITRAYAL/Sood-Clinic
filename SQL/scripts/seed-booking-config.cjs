// Manual-only seeder for the two booking rows the SQL foundation seed never creates:
// clinic_settings('primary') and the clinic_services legacy_id/legacy_sort_order mapping.
//
// It is not wired into any npm lifecycle, deploy, migration or emulator command, writes only
// these columns, and prints JSON so a reviewer can diff the plan before anything changes.
//
//   Preview, no database contacted:
//     npm run sql:seed-booking -- --manifest <reviewed.json>
//   Preview against a database (read-only transaction, current values plus the plan):
//     npm run sql:seed-booking -- --manifest <reviewed.json> --dsn postgres://...
//   Apply (one transaction, before-image captured first, rows verified before and after commit):
//     npm run sql:seed-booking -- --manifest <reviewed.json> --dsn postgres://... --apply
//                                      [--before-image <new-file.json>]
//
// The manifest is reviewed, hand-written JSON; no value is inferred from Firestore or the repo:
//   { "clinicSettings": { "bookingWindowDays": 14, "leadMinutes": 30, "intervalMinutes": 20,
//       "bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "cancelCutoffMinutes": 120,
//       "autoConfirm": false },
//     "services": [{ "code": "consultation", "legacyId": "consultation", "legacySortOrder": 0 }] }
//
// `--dsn` also reads SOOD_SQL_SEED_DSN. The script selects no credential, target or value on
// its own and refuses --apply in CI. It clears no release gate: backup/PITR, the guest relation
// review, the source/census gates and owner approval of the seed values all remain open.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const fail = (code, detail) => { throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const sameKeys = (value, keys) => Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

const SETTINGS = {
  bookingWindowDays: { column: 'booking_window_days', min: 1, max: 90 },
  leadMinutes: { column: 'lead_minutes', min: 0, max: 1440 },
  intervalMinutes: { column: 'interval_minutes', min: 5, max: 240 },
  bufferBeforeMinutes: { column: 'buffer_before_minutes', min: 0, max: 120 },
  bufferAfterMinutes: { column: 'buffer_after_minutes', min: 0, max: 120 },
  cancelCutoffMinutes: { column: 'cancel_cutoff_minutes', min: 0, max: 10080 },
};
const SETTINGS_COLUMNS = Object.values(SETTINGS).map(field => field.column).concat('auto_confirm');

function readManifest(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A template may list the values the owner still has to confirm. Preview reports them;
  // --apply refuses until the list is empty and the file has been reviewed.
  const unconfirmed = raw.unconfirmed ?? [];
  if (!Array.isArray(unconfirmed) || unconfirmed.some(entry => !text(entry, 120))) fail('INVALID_MANIFEST', 'unconfirmed must be a list of value names');
  delete raw.unconfirmed;
  if (!plain(raw) || !sameKeys(raw, ['clinicSettings', 'services'])) fail('INVALID_MANIFEST', 'expected only clinicSettings and services');
  const settings = raw.clinicSettings;
  if (!plain(settings) || !sameKeys(settings, Object.keys(SETTINGS).concat('autoConfirm'))) fail('INVALID_MANIFEST', 'clinicSettings must carry the seven policy fields');
  for (const [field, rule] of Object.entries(SETTINGS)) {
    if (!Number.isInteger(settings[field]) || settings[field] < rule.min || settings[field] > rule.max) fail('INVALID_MANIFEST', `${field} must be an integer between ${rule.min} and ${rule.max}`);
  }
  if (typeof settings.autoConfirm !== 'boolean') fail('INVALID_MANIFEST', 'autoConfirm must be a boolean');
  if (!Array.isArray(raw.services) || raw.services.length > 13) fail('INVALID_MANIFEST', 'services must be an array of at most 13 entries');
  const codes = new Set();
  for (const row of raw.services) {
    if (!plain(row) || !sameKeys(row, ['code', 'legacyId', 'legacySortOrder'])) fail('INVALID_MANIFEST', 'each service needs exactly code, legacyId and legacySortOrder');
    if (!text(row.code, 160) || !text(row.legacyId, 512)) fail('INVALID_MANIFEST', 'service code and legacyId must be bounded text');
    if (!Number.isInteger(row.legacySortOrder) || row.legacySortOrder < 0 || row.legacySortOrder > 1000) fail('INVALID_MANIFEST', 'legacySortOrder must be an integer between 0 and 1000');
    if (codes.has(row.code)) fail('DUPLICATE_SERVICE_CODE', row.code);
    codes.add(row.code);
  }
  if (new Set(raw.services.map(row => row.legacyId)).size !== raw.services.length) fail('DUPLICATE_LEGACY_ID');
  return { clinicSettings: { ...settings }, services: raw.services.map(row => ({ ...row })), unconfirmed: [...unconfirmed] };
}

const settingsList = (prefix = '') => SETTINGS_COLUMNS.map(column => `${prefix}${column}`).join(', ');
const readSettings = (sql, lock = false) => sql.query(`SELECT id, ${settingsList()} FROM clinic_settings WHERE id = 'primary'${lock ? ' FOR UPDATE' : ''}`);
const readServices = (sql, codes) => sql.query('SELECT code, legacy_id, legacy_sort_order FROM clinic_services WHERE code = ANY($1::text[]) ORDER BY code', [codes]);

function buildPlan(manifest, settingsRow, serviceRows) {
  const current = settingsRow ?? null;
  const changes = {};
  if (!current) changes.insert = { ...manifest.clinicSettings };
  else {
    for (const field of Object.keys(SETTINGS)) if (current[SETTINGS[field].column] !== manifest.clinicSettings[field]) changes[field] = { from: current[SETTINGS[field].column], to: manifest.clinicSettings[field] };
    if (current.auto_confirm !== manifest.clinicSettings.autoConfirm) changes.autoConfirm = { from: current.auto_confirm, to: manifest.clinicSettings.autoConfirm };
  }
  const blockers = [];
  const byCode = new Map(serviceRows.map(row => [row.code, row]));
  const claimed = new Map(serviceRows.filter(row => row.legacy_id).map(row => [row.legacy_id, row.code]));
  const services = manifest.services.map(row => {
    const existing = byCode.get(row.code);
    if (!existing) { blockers.push(`SERVICE_CODE_MISSING:${row.code}`); return { ...row, action: 'blocked', current: null }; }
    const owner = claimed.get(row.legacyId);
    if (owner && owner !== row.code) { blockers.push(`LEGACY_ID_CONFLICT:${row.legacyId}`); return { ...row, action: 'blocked', current: { legacyId: existing.legacy_id, legacySortOrder: existing.legacy_sort_order } }; }
    if (existing.legacy_id && existing.legacy_id !== row.legacyId) { blockers.push(`LEGACY_ID_REASSIGNMENT_REVIEW:${row.code}`); return { ...row, action: 'blocked', current: { legacyId: existing.legacy_id, legacySortOrder: existing.legacy_sort_order } }; }
    const action = existing.legacy_id === row.legacyId && existing.legacy_sort_order === row.legacySortOrder ? 'unchanged' : 'update';
    return { ...row, action, current: { legacyId: existing.legacy_id, legacySortOrder: existing.legacy_sort_order } };
  });
  return {
    settings: { action: !current ? 'insert' : Object.keys(changes).length ? 'update' : 'unchanged', current: current && { ...current }, proposed: manifest.clinicSettings, changes },
    services,
    blockers: [...new Set(blockers)].sort(),
  };
}

function statements(plan) {
  const list = [];
  if (plan.settings.action === 'insert') {
    list.push({
      text: `INSERT INTO clinic_settings (id, ${settingsList()}, updated_at) VALUES ('primary', ${SETTINGS_COLUMNS.map((_column, index) => `$${index + 1}`).join(', ')}, now())`,
      values: Object.keys(SETTINGS).map(field => plan.settings.proposed[field]).concat(plan.settings.proposed.autoConfirm),
    });
  } else if (plan.settings.action === 'update') {
    const fields = Object.keys(plan.settings.changes);
    list.push({
      text: `UPDATE clinic_settings SET ${fields.map((field, index) => `${SETTINGS[field]?.column ?? 'auto_confirm'} = $${index + 1}`).join(', ')}, updated_at = now() WHERE id = 'primary'`,
      values: fields.map(field => plan.settings.changes[field].to),
    });
  }
  for (const row of plan.services) {
    if (row.action !== 'update') continue;
    list.push({
      text: 'UPDATE clinic_services SET legacy_id = $1, legacy_sort_order = $2, updated_at = now() WHERE code = $3 AND (legacy_id IS NULL OR legacy_id = $1)',
      values: [row.legacyId, row.legacySortOrder, row.code],
    });
  }
  return list;
}

function verify(expected) {
  return (settingsRow, serviceRows) => {
    const problems = [];
    if (!settingsRow) problems.push('SETTINGS_ROW_MISSING');
    else for (const field of Object.keys(SETTINGS)) if (settingsRow[SETTINGS[field].column] !== expected.settings[field]) problems.push(`SETTINGS_VALUE_MISMATCH:${field}`);
    if (settingsRow && settingsRow.auto_confirm !== expected.settings.autoConfirm) problems.push('SETTINGS_VALUE_MISMATCH:autoConfirm');
    const byCode = new Map(serviceRows.map(row => [row.code, row]));
    for (const row of expected.services) {
      const stored = byCode.get(row.code);
      if (!stored) problems.push(`SERVICE_ROW_MISSING:${row.code}`);
      else if (stored.legacy_id !== row.legacyId) problems.push(`SERVICE_LEGACY_ID_MISMATCH:${row.code}`);
      else if (stored.legacy_sort_order !== row.legacySortOrder) problems.push(`SERVICE_SORT_ORDER_MISMATCH:${row.code}`);
    }
    return problems.sort();
  };
}

const plannedWrites = plan => (plan.settings.action === 'unchanged' ? 0 : 1) + plan.services.filter(row => row.action === 'update').length;
const beforeValues = (settingsRow, serviceRows) => ({ settings: settingsRow ?? null, services: serviceRows });

async function main() {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index === -1 ? undefined : args[index + 1]; };
  if (args.includes('--help')) {
    console.log('usage: node SQL/scripts/seed-booking-config.cjs --manifest <file> [--dsn <url>] [--apply] [--before-image <file>]');
    return;
  }
  const apply = args.includes('--apply');
  const manifestPath = value('--manifest');
  const dsn = value('--dsn') || process.env.SOOD_SQL_SEED_DSN;
  const beforeImage = value('--before-image');
  const report = { mode: apply ? 'apply' : 'preview', database: null, manifest: null, plan: null, before: null, verification: null, writes: 0, releaseGatesCleared: false };
  if (!manifestPath) fail('MANIFEST_REQUIRED', 'pass --manifest <reviewed.json>');
  if (apply && !dsn) fail('DSN_REQUIRED', '--apply needs --dsn or SOOD_SQL_SEED_DSN; nothing is written without an explicit target');
  if (apply && (process.env.CI || process.env.GITHUB_ACTIONS)) fail('CI_APPLY_REFUSED', 'run this by hand from a reviewed workstation');
  const manifest = readManifest(path.resolve(manifestPath));
  report.manifest = path.resolve(manifestPath);
  report.unconfirmed = manifest.unconfirmed;
  if (apply && manifest.unconfirmed.length) fail('OWNER_CONFIRMATION_REQUIRED', 'clear every unconfirmed value after the owner reviews it');
  const codes = manifest.services.map(row => row.code);

  if (!dsn) {
    // Offline preview: the proposed rows are shown, but no current values exist to diff.
    report.plan = { settings: { action: 'unverified', proposed: manifest.clinicSettings }, services: manifest.services.map(row => ({ ...row, action: 'unverified', current: null })), blockers: ['CURRENT_VALUES_UNVERIFIED'] };
    console.log(JSON.stringify(report, null, 2));
    console.log('Preview only: no database contacted. Pass --dsn to compare current values, then --apply to write.');
    return;
  }

  const toolsRequire = createRequire(path.resolve(__dirname, '../../node_modules/firebase-tools/package.json'));
  const { Client } = toolsRequire('pg');
  const url = new URL(dsn);
  if (!url.username || !url.pathname || url.pathname === '/') fail('DSN_INVALID', 'the connection string needs a user and a database');
  report.database = { host: url.hostname, port: url.port || '5432', name: url.pathname.replace(/^\//, '') };
  const client = new Client({ connectionString: dsn });
  const check = verify({ settings: manifest.clinicSettings, services: manifest.services });
  await client.connect();
  try {
    await client.query(apply ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
    const settingsRow = (await readSettings(client, apply)).rows[0];
    const serviceRows = (await readServices(client, codes)).rows;
    const plan = buildPlan(manifest, settingsRow, serviceRows);
    report.plan = plan;
    report.plannedWrites = plannedWrites(plan);
    if (plan.blockers.length) fail('PLAN_BLOCKED', plan.blockers.join(', '));
    if (!apply) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify(report, null, 2));
      console.log('Preview only: rolled back read-only. Add --apply to write the plan above.');
      return;
    }
    report.before = beforeValues(settingsRow, serviceRows);
    if (beforeImage) {
      try {
        fs.writeFileSync(path.resolve(beforeImage), `${JSON.stringify(report.before, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error.code === 'EEXIST') fail('BEFORE_IMAGE_EXISTS', 'refusing to overwrite an earlier capture; pick a new path');
        throw error;
      }
      report.beforeImage = path.resolve(beforeImage);
    }
    for (const statement of statements(plan)) {
      const result = await client.query(statement.text, statement.values);
      if (result.rowCount !== 1) fail('WRITE_NOT_APPLIED', statement.text.split(' SET ')[0]);
      report.writes += 1;
    }
    const inside = (await readSettings(client)).rows[0];
    const insideServices = (await readServices(client, codes)).rows;
    const insideProblems = check(inside, insideServices);
    if (insideProblems.length) fail('VERIFICATION_FAILED', insideProblems.join(', '));
    await client.query('COMMIT');
    const committed = (await readSettings(client)).rows[0];
    const committedServices = (await readServices(client, codes)).rows;
    const committedProblems = check(committed, committedServices);
    if (committedProblems.length) fail('POST_COMMIT_VERIFICATION_FAILED', committedProblems.join(', '));
    report.verification = { settings: committed, services: committedServices, problems: [] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(report.writes
    ? `${report.writes} row change(s) written and re-read outside the transaction. Keep the before-image; no release gate was cleared.`
    : 'No changes were needed; the existing rows already match the manifest and were re-read outside the transaction.');
}

module.exports = { readManifest, buildPlan, statements, verify };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.code ? JSON.stringify({ error: error.code, message: error.message }) : error.stack ?? error.message);
    process.exitCode = 1;
  });
}
