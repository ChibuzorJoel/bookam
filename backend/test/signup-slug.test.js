const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/validators');

const base = { phone: '08031234567', businessName: 'Zainab Hair', mode: 'both' };

test('signup accepts a valid slug and lowercases it', () => {
  const r = v.signup.safeParse({ ...base, slug: 'Zainab-Hair' });
  assert.ok(r.success);
  assert.strictEqual(r.data.slug, 'zainab-hair');
});

test('signup treats an empty slug as not provided', () => {
  const r = v.signup.safeParse({ ...base, slug: '' });
  assert.ok(r.success);
  assert.strictEqual(r.data.slug, undefined);
});

test('signup rejects a malformed slug', () => {
  assert.ok(!v.signup.safeParse({ ...base, slug: 'bad slug!' }).success);
  assert.ok(!v.signup.safeParse({ ...base, slug: 'ab' }).success);
});

test('changePassword needs a new password of 8+ characters; current is optional', () => {
  assert.ok(v.changePassword.safeParse({ newPassword: 'longenough1' }).success);
  assert.ok(v.changePassword.safeParse({ currentPassword: 'old', newPassword: 'longenough1' }).success);
  assert.ok(!v.changePassword.safeParse({ newPassword: 'short' }).success);
  assert.ok(!v.changePassword.safeParse({ currentPassword: 'old' }).success);
});

test('email verification validators', () => {
  assert.ok(v.emailRequest.safeParse({ email: 'Ada@Example.com' }).success);
  assert.ok(!v.emailRequest.safeParse({ email: 'nope' }).success);
  assert.ok(v.emailVerify.safeParse({ email: 'a@b.co', otp: '123456' }).success);
  assert.ok(!v.emailVerify.safeParse({ email: 'a@b.co', otp: '12345' }).success);
});

test('requestOtp channel defaults to sms and accepts email', () => {
  assert.strictEqual(v.requestOtp.parse({ phone: '08031234567' }).channel, 'sms');
  assert.strictEqual(v.requestOtp.parse({ phone: '08031234567', channel: 'email' }).channel, 'email');
  assert.ok(!v.requestOtp.safeParse({ phone: '08031234567', channel: 'whatsapp' }).success);
});
