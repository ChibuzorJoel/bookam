const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { User, Business } = require('../models');

const COOKIE_NAME = 'token';

function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.tokenVersion }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

const setAuthCookie = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions());
const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

/** Requires a valid session (HttpOnly cookie, or "Authorization: Bearer <token>" for API clients). */
const protect = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.[COOKIE_NAME];
  const header = req.headers.authorization;
  if (!token && header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token) throw new AppError('Please log in to continue.', 401, 'UNAUTHENTICATED');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Your session has expired. Please log in again.', 401, 'SESSION_EXPIRED');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tv) throw new AppError('Your session is no longer valid. Please log in again.', 401, 'SESSION_EXPIRED');
  if (user.status !== 'active') throw new AppError('This account has been disabled.', 403, 'ACCOUNT_DISABLED');

  req.user = user;
  next();
});

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new AppError('You do not have permission to do that.', 403, 'FORBIDDEN'));
  next();
};

/**
 * Multi-tenancy guard: loads the signed-in owner's business. Every /me controller then filters by
 * req.business._id, so one business can never read or change another's data.
 */
const loadBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findOne({ ownerId: req.user._id });
  if (!business) throw new AppError('No business found for this account.', 404, 'BUSINESS_NOT_FOUND');
  if (business.status === 'suspended') {
    throw new AppError('This business account is suspended. Please contact support.', 403, 'BUSINESS_SUSPENDED');
  }
  req.business = business;
  next();
});

module.exports = { protect, restrictTo, loadBusiness, signToken, setAuthCookie, clearAuthCookie };
