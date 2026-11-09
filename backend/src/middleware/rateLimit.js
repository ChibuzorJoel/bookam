const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const make = (windowMinutes, max, message, keyGenerator) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: env.NODE_ENV === 'test' ? 10000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: { status: 'error', code: 'RATE_LIMITED', message },
  });

const phoneKey = (req) => `${req.ip}:${req.body?.phone || req.body?.identifier || ''}`;

const userKey = (req) => `${req.ip}:${req.user?.id || ''}`;

module.exports = {
  apiLimiter: make(1, 240, 'Too many requests. Please slow down.'),
  otpLimiter: make(15, 6, 'Too many OTP requests. Please try again in a few minutes.', phoneKey),
  loginLimiter: make(15, 15, 'Too many login attempts. Please try again later.', phoneKey),
  changePasswordLimiter: make(15, 8, 'Too many attempts. Please try again in a few minutes.', userKey),
  emailCodeLimiter: make(15, 8, 'Too many attempts. Please try again in a few minutes.', userKey),
  publicWriteLimiter: make(10, 20, 'Too many requests. Please try again shortly.'),
  webhookLimiter: make(1, 600, 'Too many requests.'),
};
