const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'clinic-admin',
  serviceId: 'ak-sood-clinic-service',
  location: 'asia-south1'
};
exports.connectorConfig = connectorConfig;

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

