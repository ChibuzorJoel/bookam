const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { normalizePhone } = require('../utils/phone');
const { User, Business } = require('../models');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const otpService = require('../services/otp.service');
const { createBusinessForOwner } = require('../services/business.service');

const startSession = (res, user) => {
  const token = signToken(user);
  setAuthCookie(res, token);
  return token; // also returned in the body so mobile/PWA clients can use "Authorization: Bearer"
};

// POST /auth/signup  -> creates the user + their business, then texts an OTP
exports.signup = asyncHandler(async (req, res) => {
  const { phone, email, password, businessName, mode, slug } = req.body;

  let user = await User.findOne({ phone });
  if (user?.phoneVerified) throw new AppError('An account with this phone number already exists. Please log in.', 409, 'PHONE_TAKEN');

  if (email) {
    const clash = await User.findOne({ email, ...(user ? { _id: { $ne: user._id } } : {}) });
    if (clash) throw new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN');
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  if (!user) {
    user = await User.create({ phone, email, passwordHash, role: 'owner' });
    try {
      await createBusinessForOwner(user, { businessName, mode, slug });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }
  } else {
    // Retrying an unverified sign-up: refresh the details instead of failing
    user.email = email;
    if (passwordHash) user.passwordHash = passwordHash;
    await user.save();
    await Business.updateOne({ ownerId: user._id }, { $set: { name: businessName, mode } });
  }

  await otpService.sendOtp(phone, 'signup');
  res.status(201).json({ status: 'success', message: 'We sent a 6-digit code to your phone.', data: { phone } });
});

// POST /auth/request-otp  -> for OTP login or password reset (same response whether or not the account exists)
exports.requestOtp = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  const user = await User.findOne({ phone });
  const eligible = purpose === 'signup' ? user && !user.phoneVerified : user && user.phoneVerified;
  if (eligible) await otpService.sendOtp(phone, purpose);
  res.json({ status: 'success', message: 'If the number is registered, a code has been sent.' });
});

// POST /auth/verify-otp  -> completes sign-up or logs in, then starts a session
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp, purpose } = req.body;
  await otpService.verifyOtp(phone, purpose, otp);

  const user = await User.findOne({ phone });
  if (!user) throw new AppError('Account not found.', 404, 'NOT_FOUND');
  if (user.status !== 'active') throw new AppError('This account has been disabled.', 403, 'ACCOUNT_DISABLED');

  user.phoneVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  const business = await Business.findOne({ ownerId: user._id });
  const token = startSession(res, user);
  res.json({ status: 'success', data: { user: user.toSafeJSON(), business, token } });
});

// POST /auth/login  -> email-or-phone + password
exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const phone = normalizePhone(identifier);
  const user = await User.findOne(phone ? { phone } : { email: identifier.toLowerCase() }).select('+passwordHash');

  const ok = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (ok && !phone && !user.emailVerified) {
    throw new AppError('Please log in with your phone number. You can verify your email later in Account.', 403, 'EMAIL_NOT_VERIFIED');
  }
  if (!ok) throw new AppError('Incorrect phone/email or password.', 401, 'INVALID_CREDENTIALS');
  if (!user.phoneVerified) throw new AppError('Please verify your phone number first.', 403, 'PHONE_NOT_VERIFIED');
  if (user.status !== 'active') throw new AppError('This account has been disabled.', 403, 'ACCOUNT_DISABLED');

  user.lastLoginAt = new Date();
  await user.save();

  const business = await Business.findOne({ ownerId: user._id });
  const token = startSession(res, user);
  res.json({ status: 'success', data: { user: user.toSafeJSON(), business, token } });
});

// POST /auth/reset-password  -> OTP + new password; signs out every other session
exports.resetPassword = asyncHandler(async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  await otpService.verifyOtp(phone, 'reset', otp);
  const user = await User.findOne({ phone });
  if (!user) throw new AppError('Account not found.', 404, 'NOT_FOUND');
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion += 1;
  await user.save();
  res.json({ status: 'success', message: 'Password updated. Please log in.' });
});

// POST /auth/change-password  -> signed-in owner changes (or first sets) a password.
// Existing password holders must prove the current one. Every other device is signed out; this one stays signed in.
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw new AppError('Account not found.', 404, 'NOT_FOUND');

  if (user.passwordHash) {
    if (!currentPassword) throw new AppError('Enter your current password.', 400, 'CURRENT_PASSWORD_REQUIRED');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError('Your current password is not correct.', 400, 'WRONG_PASSWORD');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new AppError('Choose a password you have not used just now.', 400, 'SAME_PASSWORD');
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion += 1; // signs out every other session
  await user.save();
  startSession(res, user); // fresh cookie for this device
  res.json({ status: 'success', message: 'Password updated. Other devices have been signed out.' });
});

// POST /auth/email/request  { email } -> emails a 6-digit code to that address (signed-in owner)
exports.requestEmailCode = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // Only a VERIFIED address belonging to someone else blocks this. Unverified claims lose to the real owner.
  const clash = await User.findOne({ email, emailVerified: true, _id: { $ne: req.user._id } });
  if (clash) throw new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN');
  await otpService.sendEmailOtp(req.user.id, email);
  res.json({ status: 'success', message: `We sent a 6-digit code to ${email}.` });
});

// POST /auth/email/verify  { email, otp } -> saves the address as verified
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  await otpService.verifyEmailOtp(req.user.id, email, otp);

  // Proving the inbox beats an unverified claim made at sign-up: release the address from those accounts.
  await User.updateMany({ email, emailVerified: { $ne: true }, _id: { $ne: req.user._id } }, { $unset: { email: 1 } });

  const user = await User.findById(req.user._id);
  user.email = email;
  user.emailVerified = true;
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw new AppError('An account with this email already exists.', 409, 'EMAIL_TAKEN');
    throw err;
  }
  res.json({ status: 'success', message: 'Email verified.', data: { user: user.toSafeJSON() } });
});

// POST /auth/logout
exports.logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ status: 'success', message: 'Logged out.' });
});

// GET /auth/me
exports.me = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ ownerId: req.user._id });
  res.json({ status: 'success', data: { user: req.user.toSafeJSON(), business } });
});
