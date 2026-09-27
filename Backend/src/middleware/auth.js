const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../config/env');
const { AppError, asyncHandler } = require('../utils/http');

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentication is required.');
  let payload;
  try { payload = jwt.verify(token, jwtSecret); } catch { throw new AppError(401, 'Your session is invalid or expired.'); }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new AppError(401, 'Your account is unavailable.');
  req.user = user;
  next();
});

const permit = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new AppError(403, 'Your role is not permitted to perform this action.'));
  return next();
};

module.exports = { requireAuth, permit };
