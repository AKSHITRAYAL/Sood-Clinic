const { AppError } = require('../utils/http');

function assertBranchAccess(user, branchId) {
  if (user.role === 'admin') return;
  if (!user.branches.some((branch) => String(branch) === String(branchId))) throw new AppError(403, 'You do not have access to this branch.');
}

module.exports = { assertBranchAccess };
