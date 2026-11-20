const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { Otp } = require('../models');
const sms = require('./sms.service');
const email = require('./email.service');
const logger = require('../utils/logger');
const messages = require('../templates/messages');

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (phone, purpose, code) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`${phone}:${purpose}:${code}`).digest('hex');

/** Creates (or replaces) a code for `key`, honouring the resend cooldown. Returns the plain code to deliver. */
async function issueCode(key, purpose) {
  const existing = await Otp.findOne({ phone: key, purpose });
  if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError('Please wait a minute before requesting another code.', 429, 'OTP_COOLDOWN');
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await Otp.findOneAndUpdate(
    { phone: key, purpose },
    { codeHash: hashCode(key, purpose, code), attempts: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return code;
}

/** Delivers a login/reset/signup code. Pass { email } to send it to a VERIFIED email address instead of SMS. */
async function sendOtp(phone, purpose, { email: toEmail } = {}) {
  const code = await issueCode(phone, purpose);
  await deliverOrForget(phone, purpose, () =>
    toEmail
      ? email.send({ to: toEmail, subject: messages.emailCodeSubject(), text: messages.emailCode({ code, minutes: OTP_TTL_MINUTES }) })
      : sms.send(phone, messages.otp({ code, minutes: OTP_TTL_MINUTES }))
  );
}

/**
 * If the code could not be delivered, drop it. Otherwise the person would be told to "wait a minute" (cooldown)
 * for a code they never received, and could type an old code that no longer matches.
 */
async function deliverOrForget(key, purpose, deliver) {
  try {
    await deliver();
  } catch (err) {
    await Otp.deleteOne({ phone: key, purpose }).catch(() => {});
    throw err;
  }
}

const emailKey = (userId, address) => `email:${userId}:${address}`;

/** Emails a 6-digit code to a not-yet-verified address. The code is tied to this user AND this address. */
async function sendEmailOtp(userId, address) {
  const key = emailKey(userId, address);
  const code = await issueCode(key, 'email');
  await deliverOrForget(key, 'email', () =>
    email.send({ to: address, subject: messages.emailCodeSubject(), text: messages.emailCode({ code, minutes: OTP_TTL_MINUTES }) })
  );
}

const verifyEmailOtp = (userId, address, code) => verifyOtp(emailKey(userId, address), 'email', code);

/** Throws unless the code is valid. A used code is deleted so it cannot be replayed. */
async function verifyOtp(phone, purpose, code) {
  // Three different situations, three different messages, so the person knows what to do next.
  const none = () => new AppError('There is no active code for this number. Tap "Send a new code".', 400, 'OTP_NONE');
  const expired = () => new AppError('That code has expired. Tap "Send a new code".', 400, 'OTP_EXPIRED');
  const wrong = (left) =>
    new AppError(`That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left. If you asked for a new code, use the newest one.`, 400, 'OTP_INVALID');

  const doc = await Otp.findOneAndUpdate({ phone, purpose }, { $inc: { attempts: 1 } }, { new: true });
  if (!doc) {
    // Never logs the code itself. Tells us whether the code was issued to a different number/purpose, or already used.
    logger.warn(`OTP verify failed: no pending code for ${phone} (${purpose}). Used already, expired and cleaned up, or requested for another number.`);
    throw none();
  }
  if (doc.expiresAt < new Date()) {
    logger.warn(`OTP verify failed: code for ${phone} (${purpose}) expired at ${doc.expiresAt.toISOString()}.`);
    throw expired();
  }
  if (doc.attempts > MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: doc._id });
    throw new AppError('Too many wrong attempts. Please request a new code.', 429, 'OTP_LOCKED');
  }

  const expected = Buffer.from(doc.codeHash, 'hex');
  const actual = Buffer.from(hashCode(phone, purpose, code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    logger.warn(`OTP verify failed: wrong code for ${phone} (${purpose}), attempt ${doc.attempts} of ${MAX_ATTEMPTS}.`);
    throw wrong(Math.max(0, MAX_ATTEMPTS - doc.attempts));
  }

  await Otp.deleteOne({ _id: doc._id });
}

module.exports = { sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp };
