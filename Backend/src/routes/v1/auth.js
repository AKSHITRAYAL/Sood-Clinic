const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.post('/login', asyncHandler(async (req, res) => {
  requireFields(req.body, ['email', 'password', 'role']);
  const user = await User.findOne({ email: String(req.body.email).trim().toLowerCase() }).select('+passwordHash');
  if (!user || !user.active || user.role !== req.body.role || !(await bcrypt.compare(req.body.password, user.passwordHash))) throw new AppError(401, 'Invalid credentials for the selected role.');
  user.lastLoginAt = new Date();
  await user.save();
  await audit({ actor: user._id, action: 'auth.login', entityType: 'User', entityId: user._id });
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, branches: user.branches } });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, branches: req.user.branches } }));
module.exports = router;
