const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const { minutesFor } = require('../../functions/lib/availability');
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0');

function scheduleIdentity(snapshot, validDate) {
  const supplied = snapshot !== undefined;
  const collections = ['states', 'weekly', 'exceptions', 'windows'];
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', ...collections].includes(key)) || collections.some(key => !Array.isArray(snapshot[key])) || collections.reduce((n, key) => n + snapshot[key].length, 0) > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const indexes = {};
  for (const collection of collections) {
    const index = { ids: new Map(), legacyIds: new Map(), unique: new Map() };
    for (const source of supplied ? snapshot[collection] : []) {
      const state = collection === 'states';
      const parent = collection === 'windows' ? 'exceptionId' : 'doctorId';
      const legacy = state ? 'legacySourcePath' : 'legacyId';
      const fields = [parent, legacy, ...(state ? [] : ['id']), ...(collection === 'exceptions' ? ['date'] : [])];
      if (!plain(source) || Reflect.ownKeys(source).some(key => !fields.includes(key)) || !(source[legacy] === null || text(source[legacy])) || (collection === 'exceptions' && !validDate(source.date))) reject('INVALID_TARGET_SNAPSHOT');
      const row = { ...source, [parent]: canonicalUuid(source[parent]), ...(state ? {} : { id: canonicalUuid(source.id) }) };
      const id = state ? row.doctorId : row.id;
      const natural = state ? row.doctorId : collection === 'exceptions' ? `${row.doctorId}/${row.date}` : null;
      if (index.ids.has(id) || (row[legacy] !== null && index.legacyIds.has(row[legacy])) || (natural && index.unique.has(natural))) reject('INVALID_TARGET_SNAPSHOT');
      index.ids.set(id, row);
      if (row[legacy] !== null) index.legacyIds.set(row[legacy], row);
      if (natural) index.unique.set(natural, row);
    }
    indexes[collection] = index;
  }
  for (const row of indexes.windows.ids.values()) if (!indexes.exceptions.ids.has(row.exceptionId)) reject('INVALID_TARGET_SNAPSHOT');
  return (collection, legacyId, candidate) => {
    const index = indexes[collection];
    const state = collection === 'states';
    const parent = collection === 'windows' ? 'exceptionId' : 'doctorId';
    const natural = state ? candidate.doctorId : collection === 'exceptions' ? `${candidate.doctorId}/${candidate.date}` : null;
    const existing = index.legacyIds.get(legacyId);
    if (natural && index.unique.has(natural) && index.unique.get(natural) !== existing) reject('TARGET_UNIQUE_CONFLICT');
    if (existing && (existing[parent] !== candidate[parent] || (collection === 'exceptions' && existing.date !== candidate.date))) reject('TARGET_RELATIONSHIP_CONFLICT');
    if (existing) return { id: state ? existing.doctorId : existing.id, decision: 'reuse_existing' };
    if (!state && [...index.ids.values()].some(row => row.legacyId === null && row[parent] === candidate[parent])) reject('TARGET_UNIQUE_CONFLICT');
    const kind = { weekly: 'schedule_window', exceptions: 'schedule_exception', windows: 'exception_window' }[collection];
    const id = state ? candidate.doctorId : legacyUuid(kind, legacyId);
    if (index.ids.has(id)) reject('TARGET_ID_CONFLICT');
    return { id, decision: 'new_candidate' };
  };
}

function mapScheduleRecord(record, records, { targetSnapshot, scheduleTargetSnapshot } = {}) {
  const { inspectRecord, assessSchedule, mapCatalogRecord, timestampNanos, validDate } = require('./rehearsal.cjs');
  try {
    const assessment = assessSchedule(record, records);
    if (assessment.status === 'rejected') return assessment;
    const category = inspectRecord(record).category;
    if (!['schedules', 'exceptions'].includes(category)) return assessment;
    const resolve = scheduleIdentity(scheduleTargetSnapshot, validDate);
    const data = record.data;
    const doctors = records.filter(row => row.source === 'firestore' && row.path === `doctors/${data.doctorId}`);
    const doctor = doctors.length === 1 ? mapCatalogRecord(doctors[0], records, targetSnapshot) : null;
    if (doctor?.status !== 'mapped') reject('MISSING_REFERENCE');
    const doctorId = doctor.rows.doctor.id;
    const blockers = new Set(assessment.blockers);
    blockers.delete('SCHEDULE_TARGET_MAPPING_PENDING');
    blockers.delete('SCHEDULE_PRIVATE_METADATA_PENDING');
    blockers.add('SCHEDULE_CUTOVER_PENDING');
    if (!doctor.targetSnapshotChecked) blockers.add('SCHEDULE_DOCTOR_IDENTITY_UNCHECKED');
    if (scheduleTargetSnapshot === undefined) blockers.add('SCHEDULE_TARGET_IDENTITY_UNCHECKED');
    if (doctor.coverage.blocked) blockers.add('SCHEDULE_DEPENDENCY_BLOCKED');
    if (data.updatedAt === undefined) blockers.add('SOURCE_UPDATED_AT_MISSING');
    for (const [field, max] of [['updatedBy', 128], ['createdBy', 128], ['reason', 2000], ['note', 2000]]) if (data[field] !== undefined && (typeof data[field] !== 'string' || data[field].length > max || data[field].includes('\0'))) reject('INVALID_SCHEDULE_METADATA');
    const metadata = { legacyCreatedAt: data.createdAt ?? null, legacyUpdatedBy: data.updatedBy ?? null, updatedAt: data.updatedAt ?? null };
    const identities = []; let rows;
    const identify = (collection, legacyId, candidate) => {
      const identity = resolve(collection, legacyId, candidate); identities.push(identity);
      return identity.id;
    };
    if (category === 'schedules') {
      identify('states', record.path, { doctorId });
      rows = {
        scheduleState: { doctorId, authority: assessment.authority, legacySourcePath: record.path, ...metadata },
        doctorSchedules: data.sessions.map((session, sourceOrder) => {
          const legacyId = `${record.path}/sessions/${sourceOrder}`;
          return { id: identify('weekly', legacyId, { doctorId }), legacyId, doctorId, weekday: session.weekday, startMinute: minutesFor(session.start), endMinute: minutesFor(session.end), sourceOrder, updatedAt: metadata.updatedAt };
        }),
      };
    } else {
      const id = identify('exceptions', record.path.split('/')[1], { doctorId, date: data.dateKey });
      rows = {
        scheduleException: { id, legacyId: record.path.split('/')[1], doctorId, date: data.dateKey, kind: data.type, publicNote: null, ...metadata, legacyCreatedBy: data.createdBy ?? null, legacyNote: data.note ?? null, legacyReason: data.reason ?? null },
        exceptionWindows: (data.sessions || []).map((session, sourceOrder) => {
          const legacyId = `${record.path}/sessions/${sourceOrder}`;
          return { id: identify('windows', legacyId, { exceptionId: id }), legacyId, exceptionId: id, startMinute: minutesFor(session.start), endMinute: minutesFor(session.end), sourceOrder };
        }),
      };
    }
    const target = category === 'schedules' ? 'DoctorScheduleState' : 'ScheduleException';
    const targets = { doctorId: `${target}.doctor`, sessions: category === 'schedules' ? 'DoctorSchedule/sourceOrder' : 'ExceptionWindow/sourceOrder', createdAt: `${target}.legacyCreatedAt`, updatedAt: `${target}.updatedAt`, updatedBy: `${target}.legacyUpdatedBy`, createdBy: 'ScheduleException.legacyCreatedBy', dateKey: 'ScheduleException.date', type: 'ScheduleException.kind', reason: 'ScheduleException.legacyReason', note: 'ScheduleException.legacyNote' };
    const fields = Object.keys(data).sort().map(source => {
      if (['createdAt', 'updatedAt'].includes(source) && timestampNanos(data[source]) % 1000n) return { source, status: 'blocked', reason: 'TARGET_TIMESTAMP_PRECISION_LOSS' };
      if (!targets[source]) { blockers.add('SCHEDULE_TARGET_FIELD_PENDING'); return { source, status: 'blocked', reason: 'SCHEDULE_TARGET_FIELD_PENDING' }; }
      return { source, target: targets[source], status: 'mapped' };
    });
    return { status: 'mapped', readyForApply: false, targetSnapshotChecked: scheduleTargetSnapshot !== undefined, identities, rows, coverage: { fields, mapped: fields.filter(field => field.status === 'mapped').length, blocked: fields.filter(field => field.status === 'blocked').length }, blockers: [...blockers].sort(), source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_SCHEDULE_RECORD' }; }
}
module.exports = { mapScheduleRecord };
