const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'clinic-rehearsal',
  serviceId: 'ak-sood-clinic-service',
  location: 'asia-south1'
};
exports.connectorConfig = connectorConfig;

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

