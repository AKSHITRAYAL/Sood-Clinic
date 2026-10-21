const { HttpsError } = require('firebase-functions/v2/https');
const { createSqlPatientProfiles, sqlPatientProfileStore } = require('./sqlPatientProfiles');
const { createSqlPatientAppointments, sqlPatientAppointmentStore } = require('./sqlPatientAppointments');
const { createPatientLinking, sqlPatientLinkStore } = require('./patientLinking');
const { requireLivePatient } = require('./patientAuthorization');

// Future onCall wrappers must use these options AND the guarded handlers below.
// No export from functions/index.js until the coordinated SQL patient release.
const sqlPatientCallableOptions = Object.freeze({
  region: 'asia-south1', enforceAppCheck: true, maxInstances: 1,
  timeoutSeconds: 30, memory: '256MiB',
});

function createSqlPatientHandlers({ auth, dc, checkLinkAttempt }) {
  const profiles = createSqlPatientProfiles({ auth, store: sqlPatientProfileStore(dc) });
  const appointments = createSqlPatientAppointments({ auth, store: sqlPatientAppointmentStore(dc) });
  const linking = createPatientLinking({ auth, store: sqlPatientLinkStore(dc) });
  const checked = handler => async request => {
    // request.app is trusted callable-runtime context, never request.data.app.
    if (typeof request?.app?.appId !== 'string' || !request.app.appId || request.app.alreadyConsumed === true) {
      throw new HttpsError('failed-precondition', 'Reload the clinic website to verify this request.');
    }
    return handler(request);
  };
  return Object.freeze({
    listSqlPatientProfiles: checked(request => profiles.list(request)),
    getSqlPatientProfile: checked(request => profiles.get(request)),
    saveSqlPatientProfile: checked(request => profiles.save(request)),
    getSqlPatientHealth: checked(request => profiles.getHealth(request)),
    saveSqlPatientHealth: checked(request => profiles.saveHealth(request)),
    listSqlPatientAppointments: checked(request => appointments.list(request)),
    getSqlPatientAppointment: checked(request => appointments.get(request)),
    searchSqlStaffPatients: checked(request => profiles.searchStaff(request)),
    getSqlStaffPatientProfile: checked(request => profiles.getStaff(request)),
    saveSqlStaffPatientProfile: checked(request => profiles.saveStaff(request)),
    issueSqlPatientLink: checked(request => linking.issue(request)),
    revokeSqlPatientLink: checked(request => linking.revoke(request)),
    acceptSqlPatientLink: checked(async request => {
      const actor = await requireLivePatient(auth, request);
      if (typeof checkLinkAttempt !== 'function') throw new HttpsError('failed-precondition', 'Clinic linking is not available yet. Ask the clinic to check access.');
      // Do not pass codes, request bodies, IPs or health details to abuse storage/logs.
      let allowed;
      try { allowed = await checkLinkAttempt({ actorUid: actor.uid, appId: request.app.appId }); }
      catch { throw new HttpsError('unavailable', 'Clinic linking could not be verified. Please retry later.'); }
      if (allowed !== true) throw new HttpsError('resource-exhausted', 'Too many linking attempts. Please try again later.');
      return linking.accept(request);
    }),
  });
}
module.exports = { createSqlPatientHandlers, sqlPatientCallableOptions };
