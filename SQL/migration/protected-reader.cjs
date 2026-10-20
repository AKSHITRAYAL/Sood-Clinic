const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv, createHash, createHmac } = require('node:crypto');
const { inspectMigrationRange, mapCatalogRecord, mapPatientRecord, assessPatientOwnership, mapClinicalRecord, mapAppointmentRecord, mapExperienceRecord, mapRegistryRecord, mapBookingConfig, mapScheduleRecord } = require('./rehearsal.cjs');
const { prepareMigrationTimestamps } = require('./instant-preservation.cjs');
const root = path.resolve(__dirname, '../..');
const maxBytes = 8 * 1024 * 1024;
const magic = Buffer.from('SOODSQL1');
const fail = code => { throw new Error(code); };
const plain = value => value && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const targetKeys = new Set(['targetSnapshot', 'patientTargetSnapshot', 'serviceTargetSnapshot', 'appointmentTargetSnapshot', 'scheduleTargetSnapshot', 'clinicalTargetSnapshot', 'experienceTargetSnapshot', 'registryTargetSnapshot', 'contentSnapshot']);

function canonical(value, budget = { nodes: 0, bytes: 0 }, depth = 0) {
  if (++budget.nodes > 100000 || depth > 16) throw new Error();
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error();
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    budget.bytes += Buffer.byteLength(value);
    if (value.length > 100000 || budget.bytes > maxBytes) throw new Error();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 10000 || Reflect.ownKeys(value).length !== value.length + 1) throw new Error();
    const values = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error();
      values.push(canonical(descriptor.value, budget, depth + 1));
    }
    return `[${values.join(',')}]`;
  }
  if (!plain(value) || Reflect.ownKeys(value).length !== Object.keys(value).length || Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new Error();
  return `{${Object.keys(value).sort().map(key => {
    budget.bytes += Buffer.byteLength(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || key.length > 512 || budget.bytes > maxBytes || /^(?:private_?key|password(?:Hash|Salt)?|encryptedRefreshToken|refresh_?token|access_?token|tokenHash)$/i.test(key)) throw new Error();
    return `${JSON.stringify(key)}:${canonical(descriptor.value, budget, depth + 1)}`;
  }).join(',')}}`;
}
const keyFor = (key, purpose) => createHmac('sha256', key).update(`clinic-inspection-v1/${purpose}`).digest();
function masterKey(key) { if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error(); return Buffer.from(key); }
function seal(payload, key, purpose) {
  const text = canonical(payload);
  if (Buffer.byteLength(text) > maxBytes) throw new Error();
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyFor(key, purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
function unseal(bytes, key, purpose) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 37 || bytes.length > maxBytes + 36 || !bytes.subarray(0, 8).equals(magic)) throw new Error();
  const decipher = createDecipheriv('aes-256-gcm', keyFor(key, purpose), bytes.subarray(8, 20));
  decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(bytes.subarray(20, 36));
  const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]).toString('utf8'));
  canonical(payload);
  return payload;
}
function validateContentSnapshot(snapshot) {
  if (!plain(snapshot) || Object.keys(snapshot).sort().join(',') !== 'complete,rows,tables' || snapshot.complete !== true || !Array.isArray(snapshot.tables) || !snapshot.tables.length || !Array.isArray(snapshot.rows) || snapshot.rows.length > 10000) throw new Error();
  const schemaDir = path.join(root, 'SQL/dataconnect/schema'); const entities = new Set();
  for (const name of fs.readdirSync(schemaDir).filter(name => name.endsWith('.gql'))) {
    for (const match of fs.readFileSync(path.join(schemaDir, name), 'utf8').matchAll(/^type (\w+) @table\b/gm)) entities.add(match[1]);
  }
  if (snapshot.tables.length > entities.size || new Set(snapshot.tables).size !== snapshot.tables.length || snapshot.tables.some(table => !entities.has(table))) throw new Error();
  const seen = new Set();
  for (const row of snapshot.rows) {
    if (!plain(row) || Object.keys(row).sort().join(',') !== 'content,entityType,key,version' || !snapshot.tables.includes(row.entityType) || !Array.isArray(row.key) || !row.key.length || row.key.length > 6 || row.key.some(value => !(typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value)) && !(Number.isSafeInteger(value) && value >= 0)) || !(row.version === null || (typeof row.version === 'string' && row.version.length > 0 && row.version.length <= 512 && !/[\x00-\x1f\x7f]/.test(row.version))) || !plain(row.content)) throw new Error();
    const identity = JSON.stringify([row.entityType, row.key]);
    if (seen.has(identity)) throw new Error(); seen.add(identity);
  }
}
function validateSource(payload) {
  if (!plain(payload) || payload.version !== 1 || Object.keys(payload).sort().join(',') !== 'records,targets,version' || !Array.isArray(payload.records) || payload.records.length > 10000 || !plain(payload.targets) || Object.keys(payload.targets).some(key => !targetKeys.has(key))) throw new Error();
  const seen = new Set();
  if (Object.hasOwn(payload.targets, 'contentSnapshot')) validateContentSnapshot(payload.targets.contentSnapshot);
  for (const record of payload.records) {
    if (!plain(record) || Object.keys(record).sort().join(',') !== 'data,path,source' || !['auth', 'firestore', 'static'].includes(record.source) || typeof record.path !== 'string' || !record.path || record.path.length > 512 || /[\x00-\x1f\x7f]/.test(record.path) || !plain(record.data)) throw new Error();
    if (record.source === 'firestore' && /^(?:integrations|integrationOAuthStates)\//.test(record.path)) throw new Error();
    const identity = JSON.stringify([record.source, record.path]);
    if (seen.has(identity)) throw new Error(); seen.add(identity);
  }
}
function encodeInspectionSource(records, targets, key) {
  try {
    const payload = { version: 1, records, targets };
    // Validate descriptors before inspecting values, so getters are never invoked.
    canonical(payload); validateSource(payload);
    return seal(payload, masterKey(key), 'source');
  } catch { fail('PROTECTED_SOURCE_REJECTED'); }
}
async function protectedDirectory(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || typeof process.getuid !== 'function' || !fs.constants.O_NOFOLLOW) throw new Error();
  const relative = path.relative(root, file);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error();
  const parent = path.dirname(file); const directory = await fsp.lstat(parent);
  if (!directory.isDirectory() || directory.uid !== process.getuid() || (directory.mode & 0o777) !== 0o700 || await fsp.realpath(parent) !== parent) throw new Error();
  return parent;
}
async function protectedBytes(file) {
  await protectedDirectory(file);
  const handle = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > maxBytes + 36) throw new Error();
    // Bounded read even if a same-owner process grows the file after stat.
    const bytes = Buffer.alloc(stat.size + 1); let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size) throw new Error();
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
async function publishCheckpoint(file, bytes) {
  let temp; let handle; let directory; let published = false;
  try {
    const parent = await protectedDirectory(file);
    directory = await fsp.open(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    temp = path.join(parent, `.inspection-${randomBytes(16).toString('hex')}.tmp`);
    handle = await fsp.open(temp, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    // Exclusive link publishes a complete inode without ever replacing a previous checkpoint.
    await fsp.link(temp, file); published = true;
    await fsp.unlink(temp); temp = null;
    await directory.sync();
  } catch {
    fail(published ? 'INSPECTION_CHECKPOINT_WRITE_UNCERTAIN' : 'INSPECTION_CHECKPOINT_WRITE_REJECTED');
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (temp) await fsp.unlink(temp).catch(() => {});
    if (directory) await directory.close().catch(() => {});
  }
}
function mappingRevision() {
  const hash = createHash('sha256');
  for (const [folder, extension] of [['SQL/migration', '.cjs'], ['functions/lib', '.js'], ['SQL/dataconnect/admin', '.gql'], ['SQL/dataconnect/clinic', '.gql'], ['SQL/dataconnect/schema', '.gql']]) {
    const dir = path.join(root, folder);
    for (const name of fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isFile() && item.name.endsWith(extension)).map(item => item.name).sort()) hash.update(`${folder}/${name}\0`).update(fs.readFileSync(path.join(dir, name))).update('\0');
  }
  return hash.digest('hex');
}
async function openInspectionSource(file, suppliedKey) {
  try {
    const key = masterKey(suppliedKey); const source = unseal(await protectedBytes(file), key, 'source'); validateSource(source);
    const revision = mappingRevision();
    const digest = value => createHmac('sha256', keyFor(key, 'content')).update(canonical(value)).digest('hex');
    const bundleDigest = digest(source);
    const checked = (payload, stage) => {
      if (payload.version !== 2 || payload.stage !== stage || payload.bundleDigest !== bundleDigest || payload.revision !== revision || mappingRevision() !== revision || !Number.isInteger(payload.start) || !Number.isInteger(payload.end) || payload.start < 0 || payload.end <= payload.start || payload.end > source.records.length || payload.end - payload.start > 500 || payload.recordsDigest !== digest(source.records.slice(payload.start, payload.end))) throw new Error();
      return payload;
    };
    const entries = (page, results) => {
      if (!Array.isArray(results) || results.length !== page.end - page.start) throw new Error();
      return results.map((result, index) => {
        if (!plain(result) || Object.keys(result).sort().join(',') !== 'disposition,index,reasons' || result.index !== page.start + index || !['blocked', 'rejected', 'excluded'].includes(result.disposition) || !Array.isArray(result.reasons) || !result.reasons.length || result.reasons.length > 128 || result.reasons.some(code => typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(code))) throw new Error();
        const record = source.records[result.index];
        return { ...result, source: record.source, path: record.path, contentDigest: digest(record) };
      });
    };
    const verifiedEntries = (end, values) => {
      if (!Array.isArray(values) || canonical(values) !== canonical(entries({ start: 0, end }, values.map(({ index, disposition, reasons }) => ({ index, disposition, reasons }))))) throw new Error();
      return values;
    };
    const checkpointBytes = (page, results) => {
      const token = checked(unseal(page.token, key, 'page'), 'page');
      if (page.stage !== 'inspection' || page.applied !== 0 || page.readyForApply !== false || page.start !== token.start || page.end !== token.end || digest(page.records) !== token.recordsDigest || digest(page.targets) !== digest(source.targets)) throw new Error();
      const previous = verifiedEntries(token.start, token.previous);
      const { previous: _previous, ...metadata } = token;
      return seal({ ...metadata, stage: 'inspection', applied: 0, entries: [...previous, ...entries(token, results)] }, key, 'checkpoint');
    };
    const reconcileCandidates = group => {
        try {
          const snapshot = source.targets.contentSnapshot;
          if (!snapshot || mappingRevision() !== revision) throw new Error();
          // Only fixed, reviewed module contracts can select a mapper or row identity.
          const groups = {
            Config: { path: /^clinic\/publicConfig$/, map: record => mapBookingConfig(record, source.records, source.targets.serviceTargetSnapshot), primary: ['services'], kinds: { clinicSettings: ['ClinicSettings', ['id']], services: ['Service', ['id']] } },
            Schedule: { path: /^(doctorSchedules|scheduleExceptions)\/[^/]+$/, map: record => mapScheduleRecord(record, source.records, source.targets), primary: ['scheduleState', 'doctorSchedules', 'scheduleException', 'exceptionWindows'], kinds: { scheduleState: ['DoctorScheduleState', ['doctorId']], doctorSchedules: ['DoctorSchedule', ['id']], scheduleException: ['ScheduleException', ['id']], exceptionWindows: ['ExceptionWindow', ['id']] } },
            Catalog: { path: /^(branches|departments|doctors)\/[^/]+$/, map: record => mapCatalogRecord(record, source.records, source.targets.targetSnapshot), primary: ['branch', 'department', 'doctor'], kinds: { branch: ['Branch', ['id']], department: ['Department', ['id']], doctor: ['Doctor', ['id']], doctorDepartments: ['DoctorDepartment', ['doctorId', 'departmentId']] } },
            Patient: { path: /^patients\/[^/]+$/, map: record => mapPatientRecord(record, source.records, source.targets.patientTargetSnapshot), primary: ['patient'], kinds: { patient: ['Patient', ['id']], patientReportedProfile: ['PatientReportedProfile', ['patientId']] } },
            Clinical: { path: /^patients\/[^/]+\/medical(?:History|Documents)\/[^/]+$/, map: record => mapClinicalRecord(record, source.records, source.targets), primary: ['legacyMedicalHistory', 'legacyMedicalDocument'], kinds: { legacyMedicalHistory: ['LegacyMedicalHistory', ['id']], legacyMedicalDocument: ['LegacyMedicalDocument', ['id']] } },
            Appointment: { path: /^appointments\/[^/]+(?:\/events\/[^/]+)?$/, map: record => mapAppointmentRecord(record, source.records, source.targets), primary: ['appointment', 'appointmentEvent'], kinds: { appointment: ['Appointment', ['id']], appointmentEvent: ['AppointmentEvent', ['id']], appointmentPrivateDetails: ['AppointmentPrivateDetails', ['appointmentId']], appointmentLegacySlots: ['AppointmentLegacySlot', ['appointmentId', 'ordinal']] } },
            Experience: { path: /^(patientFeedback|auditLogs)\/[^/]+$/, map: record => mapExperienceRecord(record, source.records, source.targets), primary: ['legacyPatientFeedback', 'legacyAuditRecord'], kinds: { legacyPatientFeedback: ['LegacyPatientFeedback', ['id']], legacyAuditRecord: ['LegacyAuditRecord', ['id']] } },
            Registry: { path: /^(counters\/patientUhid|bookingRequests\/[^/]+)$/, map: record => mapRegistryRecord(record, source.records, source.targets), primary: ['legacyUhidCounter', 'legacyBookingRequest'], kinds: { legacyUhidCounter: ['LegacyUhidCounter', ['id']], legacyBookingRequest: ['LegacyBookingRequest', ['id']] } },
          };
          const config = groups[group];
          const evidenceTypes = Object.values(config.kinds).map(([type]) => type);
          const kinds = { ...config.kinds, legacySourceInstants: ['LegacySourceInstant', ['entityType', 'entityId', 'field']] };
          const types = new Set(Object.values(kinds).map(([type]) => type));
          const inScope = row => types.has(row.entityType) && (row.entityType !== 'LegacySourceInstant' || evidenceTypes.includes(row.key[0]));
          const identity = (entityType, key) => JSON.stringify([entityType, key]);
          const existing = new Map(snapshot.rows.map(row => [identity(row.entityType, row.key), row]));
          const seen = new Set(); const blockers = new Set([`${group.toUpperCase()}_RECONCILIATION_ONLY`, 'ATOMIC_VERSION_GUARD_PENDING', 'CENSUS_COMPLETENESS_PENDING', 'SCHEMA_RELEASE_PENDING']);
          if (group === 'Config') blockers.add('SETTINGS_SINGLETON_AUTHORITY_REVIEW');
          const report = { stage: 'candidate_reconciliation', status: 'blocked', sources: { inspected: 0, rejected: 0, outOfScope: 0 }, rows: { compared: 0, equal: 0, absent: 0, conflicting: 0, scopeMissing: 0, unaccounted: 0, outOfScope: snapshot.rows.filter(row => !inScope(row)).length }, applied: 0, grants: 0, readyForApply: false };
          for (const record of source.records) {
            if (record.source !== 'firestore' || !config.path.test(record.path)) { report.sources.outOfScope += 1; continue; }
            report.sources.inspected += 1;
            const candidate = config.map(record);
            if (candidate.status !== 'mapped') { report.sources.rejected += 1; blockers.add(candidate.reason || 'MODULE_CANDIDATE_REJECTED'); continue; }
            if (group === 'Patient') {
              const ownership = assessPatientOwnership(record, source.records, source.targets);
              for (const reason of ownership.blockers || [ownership.reason]) blockers.add(reason);
              if (ownership.status !== 'assessed') { report.sources.rejected += 1; continue; }
            }
            const prepared = prepareMigrationTimestamps(candidate);
            if (prepared.status !== 'prepared') { report.sources.rejected += 1; blockers.add(prepared.reason); continue; }
            for (const reason of prepared.blockers) blockers.add(reason);
            for (const field of candidate.coverage.fields) if (field.reason) blockers.add(field.reason);
            if (!candidate.targetSnapshotChecked) blockers.add('TARGET_IDENTITY_UNCHECKED');
            for (const [kind, payload] of Object.entries(prepared.rows)) {
              if (!Object.hasOwn(kinds, kind)) throw new Error();
              const [entityType, fields] = kinds[kind];
              for (const content of Array.isArray(payload) ? payload : [payload]) {
                const key = fields.map(field => content[field]);
                if (key.some(value => value === undefined || value === null)) throw new Error();
                const id = identity(entityType, key); if (seen.has(id)) throw new Error(); seen.add(id);
                if (!snapshot.tables.includes(entityType)) { report.rows.scopeMissing += 1; blockers.add('TARGET_CONTENT_SCOPE_MISSING'); continue; }
                const target = existing.get(id); const primary = config.primary.includes(kind);
                let decision = candidate.identityDecision;
                if (primary && ['Config', 'Schedule'].includes(group)) {
                  const identities = candidate.identities.filter(value => value.id === key[0]);
                  if (identities.length !== 1) throw new Error();
                  decision = identities[0].decision;
                }
                if (!target) {
                  report.rows.absent += 1; blockers.add('TARGET_CANDIDATE_ROW_ABSENT');
                  if (primary && decision === 'reuse_existing') blockers.add('TARGET_IDENTITY_CONTENT_MISMATCH');
                  continue;
                }
                report.rows.compared += 1;
                if (target.version === null) blockers.add('TARGET_VERSION_EVIDENCE_MISSING');
                if (primary && decision !== 'reuse_existing') {
                  report.rows.conflicting += 1; blockers.add('TARGET_UNLINKED_KEY_COLLISION');
                } else if (digest(target.content) !== digest(content)) {
                  report.rows.conflicting += 1; blockers.add('TARGET_CANDIDATE_CONTENT_CONFLICT');
                } else report.rows.equal += 1;
              }
            }
          }
          report.rows.unaccounted = snapshot.rows.filter(row => inScope(row) && !seen.has(identity(row.entityType, row.key))).length;
          if (report.rows.unaccounted) blockers.add('TARGET_CONTENT_UNACCOUNTED');
          if (report.rows.conflicting || blockers.has('TARGET_IDENTITY_CONTENT_MISMATCH')) report.status = 'conflict';
          report.blockers = [...blockers].sort(); return report;
        } catch { fail('CANDIDATE_RECONCILIATION_REJECTED'); }
      };
    const session = {
      revision,
      reconcileCatalogCandidates: () => reconcileCandidates('Catalog'),
      reconcilePatientCandidates: () => reconcileCandidates('Patient'),
      reconcileClinicalCandidates: () => reconcileCandidates('Clinical'),
      reconcileAppointmentCandidates: () => reconcileCandidates('Appointment'),
      reconcileExperienceCandidates: () => reconcileCandidates('Experience'),
      reconcileRegistryCandidates: () => reconcileCandidates('Registry'),
      reconcileConfigCandidates: () => reconcileCandidates('Config'),
      reconcileScheduleCandidates: () => reconcileCandidates('Schedule'),
      async reconcileSnapshot(currentFile) {
        try {
          const current = unseal(await protectedBytes(currentFile), key, 'source'); validateSource(current);
          const baseline = source.targets.contentSnapshot; const latest = current.targets.contentSnapshot;
          if (mappingRevision() !== revision || !baseline || !latest || canonical([...baseline.tables].sort()) !== canonical([...latest.tables].sort())) throw new Error();
          const compare = (before, after, identity, target = false) => {
            const old = new Map(before.map(row => [identity(row), row])); const fresh = new Map(after.map(row => [identity(row), row]));
            const counts = { added: 0, removed: 0, changed: 0, unchanged: 0, ...(target ? { contentChanged: 0, versionChanged: 0, missingVersion: 0 } : {}) };
            for (const id of new Set([...old.keys(), ...fresh.keys()])) {
              const a = old.get(id); const b = fresh.get(id);
              if (target && ((a && a.version === null) || (b && b.version === null))) counts.missingVersion += 1;
              if (!a) { counts.added += 1; continue; }
              if (!b) { counts.removed += 1; continue; }
              if (!target) { counts[digest(a) === digest(b) ? 'unchanged' : 'changed'] += 1; continue; }
              const contentChanged = digest(a.content) !== digest(b.content); const versionChanged = a.version !== b.version;
              if (contentChanged) counts.contentChanged += 1;
              if (versionChanged) counts.versionChanged += 1;
              counts[contentChanged || versionChanged ? 'changed' : 'unchanged'] += 1;
            }
            return counts;
          };
          const sourceCounts = compare(source.records, current.records, row => JSON.stringify([row.source, row.path]));
          const targetCounts = compare(baseline.rows, latest.rows, row => JSON.stringify([row.entityType, row.key]), true);
          const { contentSnapshot: _before, ...beforeMetadata } = source.targets;
          const { contentSnapshot: _after, ...afterMetadata } = current.targets;
          const metadataChanged = digest(beforeMetadata) !== digest(afterMetadata);
          const conflicts = sourceCounts.added + sourceCounts.removed + sourceCounts.changed + targetCounts.added + targetCounts.removed + targetCounts.changed + Number(metadataChanged);
          const blockers = ['RECONCILIATION_ONLY', 'ATOMIC_VERSION_GUARD_PENDING', 'CENSUS_COMPLETENESS_PENDING'];
          if (sourceCounts.added + sourceCounts.removed + sourceCounts.changed) blockers.push('SOURCE_CONTENT_CHANGED');
          if (targetCounts.added + targetCounts.removed + targetCounts.changed) blockers.push('TARGET_CONTENT_OR_VERSION_CHANGED');
          if (targetCounts.missingVersion) blockers.push('TARGET_VERSION_EVIDENCE_MISSING');
          if (metadataChanged) blockers.push('TARGET_IDENTITY_SNAPSHOT_CHANGED');
          return { stage: 'reconciliation', status: conflicts ? 'conflict' : 'unchanged', source: sourceCounts, target: targetCounts, conflicts, blockers: blockers.sort(), applied: 0, readyForApply: false };
        } catch { fail('CONTENT_RECONCILIATION_REJECTED'); }
      },
      async page({ checkpointPath, limit = 100 } = {}) {
        let start = 0; let previous = [];
        if (checkpointPath !== undefined) {
          try {
            const checkpoint = checked(unseal(await protectedBytes(checkpointPath), key, 'checkpoint'), 'inspection');
            if (checkpoint.applied !== 0) throw new Error();
            previous = verifiedEntries(checkpoint.end, checkpoint.entries);
            start = checkpoint.end;
          }
          catch { fail('INSPECTION_CHECKPOINT_REJECTED'); }
        }
        try {
          if (!Number.isInteger(limit) || limit < 1 || limit > 500 || mappingRevision() !== revision) throw new Error();
          const end = Math.min(start + limit, source.records.length);
          const token = end > start ? seal({ version: 2, stage: 'page', bundleDigest, revision, start, end, recordsDigest: digest(source.records.slice(start, end)), previous }, key, 'page') : null;
          return { stage: 'inspection', start, end, done: end === source.records.length, records: structuredClone(source.records.slice(start, end)), targets: structuredClone(source.targets), applied: 0, readyForApply: false, token };
        } catch { fail('INSPECTION_PAGE_REJECTED'); }
      },
      checkpoint(page, results) {
        try {
          return checkpointBytes(page, results);
        } catch { fail('INSPECTION_PAGE_REJECTED'); }
      },
      async saveCheckpoint(page, results, destination) {
        let bytes;
        try { bytes = checkpointBytes(page, results); }
        catch { fail('INSPECTION_CHECKPOINT_WRITE_REJECTED'); }
        await publishCheckpoint(destination, bytes);
      },
      async inspectAndSave(options = {}) {
        let page; let results; let bytes;
        try {
          canonical(options);
          if (!plain(options) || Object.keys(options).some(key => !['checkpointPath', 'limit', 'destination'].includes(key))) throw new Error();
          page = await session.page({ checkpointPath: options.checkpointPath, limit: options.limit });
          // Recompute the full prefix; caller-authored dispositions cannot stand in for validators.
          if (page.start) {
            const prior = page.token ? checked(unseal(page.token, key, 'page'), 'page').previous : checked(unseal(await protectedBytes(options.checkpointPath), key, 'checkpoint'), 'inspection').entries;
            if (canonical(prior) !== canonical(entries({ start: 0, end: page.start }, inspectMigrationRange(source.records, source.targets, 0, page.start)))) throw new Error();
          }
          results = inspectMigrationRange(source.records, source.targets, page.start, page.end);
          if (results.length) bytes = checkpointBytes(page, results);
        } catch { fail('INSPECTION_VALIDATION_REJECTED'); }
        if (bytes) await publishCheckpoint(options.destination, bytes);
        const report = { stage: 'inspection', start: page.start, end: page.end, done: page.done, inspected: results.length, blocked: 0, rejected: 0, excluded: 0, reasons: {}, applied: 0, readyForApply: false };
        for (const result of results) {
          report[result.disposition] += 1;
          for (const code of result.reasons) report.reasons[code] = (report.reasons[code] || 0) + 1;
        }
        report.reasons = Object.fromEntries(Object.entries(report.reasons).sort());
        return report;
      },
    };
    return session;
  } catch { fail('PROTECTED_SOURCE_REJECTED'); }
}
module.exports = { encodeInspectionSource, openInspectionSource };
