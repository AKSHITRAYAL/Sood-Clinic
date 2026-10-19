const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'clinic',
  service: 'ak-sood-clinic-service',
  location: 'asia-south1'
};
exports.connectorConfig = connectorConfig;

const getPublicClinicRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetPublicClinic');
}
getPublicClinicRef.operationName = 'GetPublicClinic';
exports.getPublicClinicRef = getPublicClinicRef;

exports.getPublicClinic = function getPublicClinic(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getPublicClinicRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const getOwnSqlProfileRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetOwnSqlProfile');
}
getOwnSqlProfileRef.operationName = 'GetOwnSqlProfile';
exports.getOwnSqlProfileRef = getOwnSqlProfileRef;

exports.getOwnSqlProfile = function getOwnSqlProfile(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getOwnSqlProfileRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const getPublicClinicContactRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetPublicClinicContact');
}
getPublicClinicContactRef.operationName = 'GetPublicClinicContact';
exports.getPublicClinicContactRef = getPublicClinicContactRef;

exports.getPublicClinicContact = function getPublicClinicContact(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getPublicClinicContactRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const saveOwnSqlProfileRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'SaveOwnSqlProfile', inputVars);
}
saveOwnSqlProfileRef.operationName = 'SaveOwnSqlProfile';
exports.saveOwnSqlProfileRef = saveOwnSqlProfileRef;

exports.saveOwnSqlProfile = function saveOwnSqlProfile(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(saveOwnSqlProfileRef(dcInstance, inputVars));
}
;
