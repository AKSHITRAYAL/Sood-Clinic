const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { mapCatalogRecord, legacyUuid } = require('../migration/rehearsal.cjs');
const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
const { firestoreConfig } = require('../../functions/lib/bookingFallback');
const { projectCatalogue } = require('../../functions/lib/sqlCatalogue');
const { projectBookingSettings } = require('../../functions/lib/bookingSettings');
const { cloudPublicCatalogue, cloudSql } = require('./cloud.cjs');

const tables = {
  branch: 'clinic_branches', department: 'clinic_departments', doctor: 'clinic_doctors',
  doctorDepartments: 'clinic_doctor_departments', legacySourceInstants: 'clinic_legacy_source_instants',
  services: 'clinic_services', clinicSettings: 'clinic_settings', doctorServices: 'clinic_doctor_services',
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const sourceDigest = source => createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value && Number.isSafeInteger(Number(value.integerValue))) return Number(value.integerValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  throw new Error('PUBLIC_SOURCE_VALUE_UNSUPPORTED');
}
function buildPublicImport(source, now) {
  const records = ['branches', 'departments', 'doctors'].flatMap(name => {
    const page = source[name];
    if (!page || page.nextPageToken || !Array.isArray(page.documents) || !page.documents.length) throw new Error('PUBLIC_CATALOGUE_INCOMPLETE');
    return page.documents.map(doc => {
      if (!doc.name?.startsWith(`projects/sood-clinic/databases/(default)/documents/${name}/`)) throw new Error('PUBLIC_SOURCE_TARGET_MISMATCH');
      const data = decode({ mapValue: { fields: doc.fields || {} } });
      // Historical doctor identity hints remain in the captured source, never SQL access grants.
      if (name === 'doctors') {
        if (data.role !== undefined && data.role !== 'doctor') throw new Error('DOCTOR_ROLE_REVIEW_REQUIRED');
        if (data.userId !== undefined && (typeof data.userId !== 'string' || data.userId.length > 128)) throw new Error('DOCTOR_IDENTITY_REVIEW_REQUIRED');
        delete data.role; delete data.userId;
      }
      return { source: 'firestore', path: `${name}/${doc.name.split('/').at(-1)}`, data: { ...data, createdAt: data.createdAt ?? doc.createTime, updatedAt: data.updatedAt ?? doc.updateTime } };
    });
  });
  const output = Object.fromEntries(Object.keys(tables).map(name => [name, []]));
  for (const record of records) {
    const mapped = mapCatalogRecord(record, records, { complete: true, branches: [], departments: [], doctors: [] });
    if (mapped.status !== 'mapped') throw new Error(`PUBLIC_CATALOGUE_REJECTED:${mapped.reason}`);
    const prepared = prepareMigrationTimestamps(mapped);
    if (prepared.status !== 'prepared') throw new Error('PUBLIC_TIMESTAMP_REJECTED');
    for (const [alias, rows] of Object.entries(prepared.rows)) output[alias].push(...(Array.isArray(rows) ? rows : [rows]));
  }
  const raw = source['clinic/publicConfig'];
  const config = firestoreConfig(raw ? decode({ mapValue: { fields: raw.fields || {} } }) : undefined);
  output.clinicSettings.push({ id: 'primary', ...Object.fromEntries(['bookingWindowDays', 'leadMinutes', 'intervalMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes', 'cancelCutoffMinutes', 'autoConfirm'].map(key => [key, config[key]])), updatedAt: now });
  output.services = config.visitTypes.map((row, order) => ({ id: legacyUuid('service', row.id), legacyId: row.id, code: row.id, name: row.label, durationMinutes: row.minutes, bufferMinutes: 0, consultationMode: row.mode, active: row.active, legacySortOrder: order, updatedAt: now }));
  output.doctorServices = output.doctor.flatMap(doctor => output.services.map(service => ({ doctorId: doctor.id, serviceId: service.id })));
  // Run the same projections the website uses before constructing any write.
  projectCatalogue({ branches: output.branch, departments: output.department, doctors: output.doctor, doctorDepartments: output.doctorDepartments });
  projectBookingSettings({ clinicSettings: output.clinicSettings[0], services: output.services });
  return output;
}
function insertStatements(rows) {
  return Object.entries(tables).flatMap(([alias, table]) => rows[alias].map(row => {
    const columns = Object.keys(row);
    if (columns.some(key => !/^[a-z][a-zA-Z0-9]*$/.test(key))) throw new Error('PUBLIC_COLUMN_INVALID');
    return { text: `INSERT INTO ${table} (${columns.map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)).join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`, values: columns.map(key => row[key]) };
  }));
}
async function readSource() {
  const names = ['branches', 'departments', 'doctors', 'clinic/publicConfig'];
  return Object.fromEntries(await Promise.all(names.map(async name => {
    try { return [name, await cloudPublicCatalogue(name)]; }
    catch (error) { if (name === 'clinic/publicConfig' && error.status === 404) return [name, null]; throw error; }
  })));
}
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Use --apply only after reviewing the preview.');
  const source = await readSource();
  const rows = buildPublicImport(source, new Date().toISOString());
  const names = Object.values(tables);
  const existingTables = new Set((await cloudSql(["SELECT table_name FROM information_schema.tables WHERE table_schema='public'"]))[0].rows.map(row => row.table_name));
  const present = names.filter(name => existingTables.has(name));
  const censusRows = (await cloudSql(['BEGIN READ ONLY', ...present.map(table => `SELECT count(*)::int AS n FROM ${table}`), 'COMMIT'])).slice(1, -1);
  const census = names.map(name => existingTables.has(name) ? censusRows[present.indexOf(name)].rows[0].n : 0);
  const report = { mode: process.argv.includes('--apply') ? 'apply' : 'preview', target: 'sood-clinic/ak-sood-clinic-database', counts: Object.fromEntries(Object.entries(rows).map(([alias, data]) => [alias, data.length])), existing: Object.fromEntries(names.map((name, index) => [name, census[index]])), writes: 0 };
  if (census.some(count => count !== 0)) throw new Error('PUBLIC_TARGET_NOT_EMPTY: reconcile existing catalogue before importing; no overwrites allowed.');
  report.missingTables = names.filter(name => !existingTables.has(name));
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify(report)); return; }
  if (report.missingTables.length) throw new Error('PUBLIC_SCHEMA_MIGRATION_REQUIRED');
  if (sourceDigest(await readSource()) !== sourceDigest(source)) throw new Error('PUBLIC_SOURCE_CHANGED');
  const backupDir = path.resolve(__dirname, '../../.local/sql-migration');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDir, `public-catalogue-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ source, before: report.existing }), { mode: 0o600, flag: 'wx' });
  const guards = names.map(table => `IF EXISTS (SELECT 1 FROM ${table}) THEN RAISE EXCEPTION 'PUBLIC_TARGET_CHANGED'; END IF;`).join('\n');
  const statements = insertStatements(rows);
  await cloudSql([`LOCK TABLE ${names.join(',')} IN SHARE ROW EXCLUSIVE MODE`, `DO $$ BEGIN ${guards} END $$`, ...statements], { transaction: true });
  const after = (await cloudSql(['BEGIN READ ONLY', ...names.map(table => `SELECT count(*)::int AS n FROM ${table}`), 'COMMIT'])).slice(1, -1).map(result => result.rows[0].n);
  if (Object.keys(tables).some((alias, index) => after[index] !== rows[alias].length)) throw new Error('PUBLIC_IMPORT_POST_COMMIT_REVIEW_REQUIRED');
  console.log(JSON.stringify({ ...report, writes: statements.length, backup, verified: true }));
}
module.exports = { decode, buildPublicImport, insertStatements, sourceDigest };
if (require.main === module) main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
