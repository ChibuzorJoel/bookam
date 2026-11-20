process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// In-memory stand-ins for the Otp collection and the SMS sender.
const rows = new Map();
const k = (q) => `${q.phone}|${q.purpose}`;
const Otp = {
  findOne: async (q) => rows.get(k(q)) || null,
  findOneAndUpdate: async (q, u) => {
    const cur = rows.get(k(q));
    if (u.$inc) {
      if (!cur) return null;
      cur.attempts += u.$inc.attempts;
      return cur;
    }
    const doc = { _id: k(q), phone: q.phone, purpose: q.purpose, ...u };
    rows.set(k(q), doc);
    return doc;
  },
  deleteOne: async (q) => {
    if (q._id) rows.delete(q._id);
    else rows.delete(k(q));
    return {};
  },
};
let smsShouldFail = false;
let lastSms = '';
const inject = (rel, exports_) => {
  const id = require.resolve(path.join('../src', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports: exports_ };
};
inject('models', { Otp });
inject('services/sms.service', {
  send: async (_to, msg) => {
    if (smsShouldFail) throw new Error('sms down');
    lastSms = msg;
  },
});
inject('services/email.service', { send: async () => {} });

const otp = require('../src/services/otp.service');
const PHONE = '2348031234567';
const codeFromSms = () => lastSms.match(/\d{6}/)[0];

test('a failed SMS leaves no code behind, so the retry is not blocked by the cooldown', async () => {
  rows.clear();
  smsShouldFail = true;
  await assert.rejects(otp.sendOtp(PHONE, 'signup'), /sms down/);
  assert.strictEqual(rows.size, 0);
  smsShouldFail = false;
  await otp.sendOtp(PHONE, 'signup'); // would have thrown OTP_COOLDOWN before
  assert.strictEqual(rows.size, 1);
});

test('the right code works once, then reports that there is no active code', async () => {
  rows.clear();
  await otp.sendOtp(PHONE, 'login');
  await otp.verifyOtp(PHONE, 'login', codeFromSms());
  await assert.rejects(otp.verifyOtp(PHONE, 'login', codeFromSms()), (e) => e.code === 'OTP_NONE');
});

test('a wrong code says how many tries are left; an expired code says expired', async () => {
  rows.clear();
  await otp.sendOtp(PHONE, 'login');
  await assert.rejects(otp.verifyOtp(PHONE, 'login', '000000'), (e) => e.code === 'OTP_INVALID' && /4 tries left/.test(e.message));
  rows.get(`${PHONE}|login`).expiresAt = new Date(Date.now() - 1000);
  await assert.rejects(otp.verifyOtp(PHONE, 'login', codeFromSms()), (e) => e.code === 'OTP_EXPIRED');
});

test('a new code replaces the old one', async () => {
  rows.clear();
  await otp.sendOtp(PHONE, 'login');
  const first = codeFromSms();
  rows.get(`${PHONE}|login`).createdAt = new Date(Date.now() - 120000); // past the cooldown
  await otp.sendOtp(PHONE, 'login');
  const second = codeFromSms();
  if (first !== second) {
    await assert.rejects(otp.verifyOtp(PHONE, 'login', first), (e) => e.code === 'OTP_INVALID');
  }
  await otp.verifyOtp(PHONE, 'login', second);
});
