const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'clinic-admin',
  serviceId: 'ak-sood-clinic-service',
  location: 'asia-south1'
};
exports.connectorConfig = connectorConfig;

function readAdminAuditLog(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReadAdminAuditLog', inputVars, inputOpts);
}
exports.readAdminAuditLog = readAdminAuditLog;

function readAdminAuditLogAfter(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReadAdminAuditLogAfter', inputVars, inputOpts);
}
exports.readAdminAuditLogAfter = readAdminAuditLogAfter;

function readBookingSettings(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadBookingSettings', undefined, inputOpts);
}
exports.readBookingSettings = readBookingSettings;

function getBookingSettingsReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetBookingSettingsReceipt', inputVars, inputOpts);
}
exports.getBookingSettingsReceipt = getBookingSettingsReceipt;

function saveBookingSettings(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveBookingSettings', inputVars, inputOpts);
}
exports.saveBookingSettings = saveBookingSettings;

function createBookingService(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateBookingService', inputVars, inputOpts);
}
exports.createBookingService = createBookingService;

function updateBookingService(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpdateBookingService', inputVars, inputOpts);
}
exports.updateBookingService = updateBookingService;

function readSqlCatalogue(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadSqlCatalogue', undefined, inputOpts);
}
exports.readSqlCatalogue = readSqlCatalogue;

function getCatalogueReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetCatalogueReceipt', inputVars, inputOpts);
}
exports.getCatalogueReceipt = getCatalogueReceipt;

function createCatalogueBranch(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateCatalogueBranch', inputVars, inputOpts);
}
exports.createCatalogueBranch = createCatalogueBranch;

function updateCatalogueBranch(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpdateCatalogueBranch', inputVars, inputOpts);
}
exports.updateCatalogueBranch = updateCatalogueBranch;

function createCatalogueDepartment(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateCatalogueDepartment', inputVars, inputOpts);
}
exports.createCatalogueDepartment = createCatalogueDepartment;

function updateCatalogueDepartment(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpdateCatalogueDepartment', inputVars, inputOpts);
}
exports.updateCatalogueDepartment = updateCatalogueDepartment;

function createCatalogueDoctor(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateCatalogueDoctor', inputVars, inputOpts);
}
exports.createCatalogueDoctor = createCatalogueDoctor;

function updateCatalogueDoctor(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpdateCatalogueDoctor', inputVars, inputOpts);
}
exports.updateCatalogueDoctor = updateCatalogueDoctor;

function readStaffClinicDay(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReadStaffClinicDay', inputVars, inputOpts);
}
exports.readStaffClinicDay = readStaffClinicDay;

function readStaffClinicDayAfter(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReadStaffClinicDayAfter', inputVars, inputOpts);
}
exports.readStaffClinicDayAfter = readStaffClinicDayAfter;

function getAdminClinicContact(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetAdminClinicContact', undefined, inputOpts);
}
exports.getAdminClinicContact = getAdminClinicContact;

function getClinicContactReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetClinicContactReceipt', inputVars, inputOpts);
}
exports.getClinicContactReceipt = getClinicContactReceipt;

function saveClinicContact(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveClinicContact', inputVars, inputOpts);
}
exports.saveClinicContact = saveClinicContact;

function checkSqlFoundation(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('CheckSqlFoundation', undefined, inputOpts);
}
exports.checkSqlFoundation = checkSqlFoundation;

function importPublicClinicContact(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ImportPublicClinicContact', inputVars, inputOpts);
}
exports.importPublicClinicContact = importPublicClinicContact;

function seedFoundation(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SeedFoundation', undefined, inputOpts);
}
exports.seedFoundation = seedFoundation;

function listLinkedPatientAppointments(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListLinkedPatientAppointments', inputVars, inputOpts);
}
exports.listLinkedPatientAppointments = listLinkedPatientAppointments;

function listLinkedPatientAppointmentsBefore(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListLinkedPatientAppointmentsBefore', inputVars, inputOpts);
}
exports.listLinkedPatientAppointmentsBefore = listLinkedPatientAppointmentsBefore;

function readLinkedPatientAppointment(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadLinkedPatientAppointment', inputVars, inputOpts);
}
exports.readLinkedPatientAppointment = readLinkedPatientAppointment;

function readLinkedPatientHealth(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadLinkedPatientHealth', inputVars, inputOpts);
}
exports.readLinkedPatientHealth = readLinkedPatientHealth;

function saveLinkedPatientHealth(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveLinkedPatientHealth', inputVars, inputOpts);
}
exports.saveLinkedPatientHealth = saveLinkedPatientHealth;

function consumePatientLinkAttempt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ConsumePatientLinkAttempt', inputVars, inputOpts);
}
exports.consumePatientLinkAttempt = consumePatientLinkAttempt;

function issuePatientLinkInvitation(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('IssuePatientLinkInvitation', inputVars, inputOpts);
}
exports.issuePatientLinkInvitation = issuePatientLinkInvitation;

function findPatientLinkInvitation(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('FindPatientLinkInvitation', inputVars, inputOpts);
}
exports.findPatientLinkInvitation = findPatientLinkInvitation;

function acceptPatientLinkInvitation(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('AcceptPatientLinkInvitation', inputVars, inputOpts);
}
exports.acceptPatientLinkInvitation = acceptPatientLinkInvitation;

function revokePatientLink(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('RevokePatientLink', inputVars, inputOpts);
}
exports.revokePatientLink = revokePatientLink;

function listLinkedPatientProfiles(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListLinkedPatientProfiles', inputVars, inputOpts);
}
exports.listLinkedPatientProfiles = listLinkedPatientProfiles;

function readLinkedPatientProfile(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadLinkedPatientProfile', inputVars, inputOpts);
}
exports.readLinkedPatientProfile = readLinkedPatientProfile;

function getPatientProfileReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetPatientProfileReceipt', inputVars, inputOpts);
}
exports.getPatientProfileReceipt = getPatientProfileReceipt;

function saveLinkedPatientProfile(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveLinkedPatientProfile', inputVars, inputOpts);
}
exports.saveLinkedPatientProfile = saveLinkedPatientProfile;

function rehearseBranchCompareAndSet(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('RehearseBranchCompareAndSet', inputVars, inputOpts);
}
exports.rehearseBranchCompareAndSet = rehearseBranchCompareAndSet;

function inspectBranchRehearsal(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('InspectBranchRehearsal', inputVars, inputOpts);
}
exports.inspectBranchRehearsal = inspectBranchRehearsal;

function readDoctorUnitRange(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadDoctorUnitRange', inputVars, inputOpts);
}
exports.readDoctorUnitRange = readDoctorUnitRange;

function claimAppointmentUnits(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ClaimAppointmentUnits', inputVars, inputOpts);
}
exports.claimAppointmentUnits = claimAppointmentUnits;

function releaseAppointmentUnits(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReleaseAppointmentUnits', inputVars, inputOpts);
}
exports.releaseAppointmentUnits = releaseAppointmentUnits;

function releaseHoldUnits(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReleaseHoldUnits', inputVars, inputOpts);
}
exports.releaseHoldUnits = releaseHoldUnits;

function readDoctorSpecialHours(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadDoctorSpecialHours', inputVars, inputOpts);
}
exports.readDoctorSpecialHours = readDoctorSpecialHours;

function readDoctorSpecialHoursReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadDoctorSpecialHoursReceipt', inputVars, inputOpts);
}
exports.readDoctorSpecialHoursReceipt = readDoctorSpecialHoursReceipt;

function saveDoctorSpecialHours(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveDoctorSpecialHours', inputVars, inputOpts);
}
exports.saveDoctorSpecialHours = saveDoctorSpecialHours;

function searchStaffPatientsByUhid(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SearchStaffPatientsByUhid', inputVars, inputOpts);
}
exports.searchStaffPatientsByUhid = searchStaffPatientsByUhid;

function searchStaffPatientsByPhone(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SearchStaffPatientsByPhone', inputVars, inputOpts);
}
exports.searchStaffPatientsByPhone = searchStaffPatientsByPhone;

function readStaffPatientDemographics(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ReadStaffPatientDemographics', inputVars, inputOpts);
}
exports.readStaffPatientDemographics = readStaffPatientDemographics;

function saveStaffPatientDemographics(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveStaffPatientDemographics', inputVars, inputOpts);
}
exports.saveStaffPatientDemographics = saveStaffPatientDemographics;

function listStaffIdentityPage(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListStaffIdentityPage', inputVars, inputOpts);
}
exports.listStaffIdentityPage = listStaffIdentityPage;

function beginStaffAccessChange(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('BeginStaffAccessChange', inputVars, inputOpts);
}
exports.beginStaffAccessChange = beginStaffAccessChange;

function finishStaffAccessChange(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('FinishStaffAccessChange', inputVars, inputOpts);
}
exports.finishStaffAccessChange = finishStaffAccessChange;

function abortStaffAccessChange(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('AbortStaffAccessChange', inputVars, inputOpts);
}
exports.abortStaffAccessChange = abortStaffAccessChange;

function listStaffAudit(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListStaffAudit', inputVars, inputOpts);
}
exports.listStaffAudit = listStaffAudit;

function inspectStaffAccessLock(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('InspectStaffAccessLock', undefined, inputOpts);
}
exports.inspectStaffAccessLock = inspectStaffAccessLock;

function inspectStaffAccessChange(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('InspectStaffAccessChange', inputVars, inputOpts);
}
exports.inspectStaffAccessChange = inspectStaffAccessChange;

function upsertStaffIdentity(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('UpsertStaffIdentity', inputVars, inputOpts);
}
exports.upsertStaffIdentity = upsertStaffIdentity;

function readDoctorWeeklyHours(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadDoctorWeeklyHours', inputVars, inputOpts);
}
exports.readDoctorWeeklyHours = readDoctorWeeklyHours;

function readDoctorWeeklyHoursReceipt(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ReadDoctorWeeklyHoursReceipt', inputVars, inputOpts);
}
exports.readDoctorWeeklyHoursReceipt = readDoctorWeeklyHoursReceipt;

function saveDoctorWeeklyHours(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('SaveDoctorWeeklyHours', inputVars, inputOpts);
}
exports.saveDoctorWeeklyHours = saveDoctorWeeklyHours;

