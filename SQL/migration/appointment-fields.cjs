const { minutesFor } = require('../../functions/lib/availability');
const reject = () => { throw Object.assign(new Error('INVALID_APPOINTMENT_FIELD'), { migrationCode: 'INVALID_APPOINTMENT_FIELD' }); };

function appointmentFields(record, row, { timestampNanos, validDate }) {
  const data = record.data; const targets = {}; const fields = []; const blockers = new Set();
  const isEvent = record.path.split('/').length === 4;
  const text = (value, max = 160) => {
    if (value !== null && (typeof value !== 'string' || value.length > max || value.includes('\0'))) reject();
    return value;
  };
  const instant = (value, source) => {
    if (timestampNanos(value) % 1000n) {
      blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS');
      fields.push({ source, status: 'blocked', reason: 'TARGET_TIMESTAMP_PRECISION_LOSS' });
    }
    return value;
  };
  if (isEvent) {
    const columns = { reason: 'legacyReason', createdAt: 'legacyCreatedAt', updatedAt: 'legacyUpdatedAt' };
    for (const [source, target] of Object.entries(columns)) if (Object.hasOwn(data, source)) {
      row[target] = source.endsWith('At') ? instant(data[source], source) : text(data[source], 2000);
      targets[source] = `AppointmentEvent.${target}`;
    }
    if (data.meta !== undefined) {
      const columns = { source: 'legacyMetaSource', action: 'legacyMetaAction', dateKey: 'legacyDate', fromDateKey: 'legacyFromDate', toDateKey: 'legacyToDate', toTime: 'legacyToTime' };
      for (const [source, value] of Object.entries(data.meta)) {
        text(value);
        if (source.endsWith('Key') && !validDate(value)) reject();
        if (source === 'toTime' && !Number.isInteger(minutesFor(value))) reject();
        if (!columns[source]) reject();
        row[columns[source]] = value;
      }
      targets.meta = 'AppointmentEvent.legacyMetaSource/legacyMetaAction/legacyDate/legacyFromDate/legacyToDate/legacyToTime';
    }
    return { targets, fields, blockers: [...blockers], rows: {} };
  }
  Object.assign(row, { visitMode: data.visitMode, legacyVisitType: data.visitType, createdByRole: data.createdBy?.role ?? null });
  Object.assign(targets, { visitMode: 'Appointment.visitMode', visitType: 'Appointment.legacyVisitType/service', createdBy: 'Appointment.createdByUid/createdByRole', departmentId: 'Appointment.department' });
  const privateFields = ['patientSnapshot', 'phoneKey', 'reason', 'slotId', 'slotIds', 'externalCalendar', 'videoConsultation', 'cancellation'];
  if (!privateFields.some(field => Object.hasOwn(data, field))) return { targets, fields, blockers: [...blockers], rows: {} };
  const details = { appointmentId: row.id, legacySlotListPresent: Object.hasOwn(data, 'slotIds') };
  const direct = { reason: 'reason', phoneKey: 'phoneKey', slotId: 'legacySlotId' };
  for (const [source, target] of Object.entries(direct)) if (Object.hasOwn(data, source)) {
    details[target] = text(data[source], source === 'reason' ? 2000 : 160);
    targets[source] = `AppointmentPrivateDetails.${target}`;
  }
  const nested = {
    patientSnapshot: { name: 'snapshotName', phone: 'snapshotPhone', email: 'snapshotEmail' },
    externalCalendar: { provider: 'calendarProvider', calendarId: 'calendarId', eventId: 'calendarEventId', syncStatus: 'calendarSyncStatus', lastSyncedAt: 'calendarLastSyncedAt', lastSyncError: 'calendarLastSyncError' },
    videoConsultation: { status: 'videoStatus', joinUrl: 'videoJoinUrl', preparedBy: 'videoPreparedBy', preparedAt: 'videoPreparedAt', clearedBy: 'videoClearedBy', clearedAt: 'videoClearedAt' },
    cancellation: { byUid: 'cancellationByUid', byRole: 'cancellationByRole', reason: 'cancellationReason', at: 'cancellationAt' },
  };
  for (const [source, columns] of Object.entries(nested)) if (Object.hasOwn(data, source)) {
    const value = data[source];
    if (value === null && source === 'videoConsultation') details.videoStatus = null;
    else {
      if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
      for (const [key, item] of Object.entries(value)) {
        if (!columns[key]) reject();
        const timestamp = key.endsWith('At') || key === 'at';
        details[columns[key]] = timestamp ? instant(item, `${source}.${key}`) : text(item, key === 'joinUrl' || key === 'reason' || key === 'lastSyncError' ? 2000 : source === 'patientSnapshot' ? 320 : key.endsWith('By') || key === 'byUid' ? 128 : 160);
      }
    }
    targets[source] = `AppointmentPrivateDetails.${Object.values(columns).join('/')}`;
  }
  const url = details.videoJoinUrl;
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { reject(); }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) reject();
  }
  if (data.videoConsultation && data.visitMode !== 'video') blockers.add('VIDEO_MODE_HISTORY_REVIEW');
  if (data.cancellation && data.status !== 'cancelled') blockers.add('CANCELLATION_STATE_REVIEW');
  if (data.cancellation?.byRole !== undefined && !['public', 'guest', 'patient', 'manager', 'doctor', 'admin', 'system'].includes(data.cancellation.byRole)) reject();
  const rows = { appointmentPrivateDetails: details };
  if (Object.hasOwn(data, 'slotIds')) {
    if (!Array.isArray(data.slotIds) || data.slotIds.length > 1000) reject();
    rows.appointmentLegacySlots = data.slotIds.map((value, ordinal) => ({ appointmentId: row.id, ordinal, legacySlotId: text(value) }));
    targets.slotIds = 'AppointmentLegacySlot.ordinal/legacySlotId/AppointmentPrivateDetails.legacySlotListPresent';
  }
  return { targets, fields, blockers: [...blockers], rows };
}
module.exports = { appointmentFields };
