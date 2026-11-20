process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { signToken, setAuthCookie } = require('../src/middleware/auth');

test('a login lasts SESSION_DAYS (2 by default), in both the token and the cookie', () => {
  assert.strictEqual(env.SESSION_DAYS, 2);
  const token = signToken({ id: 'u1', tokenVersion: 0 });
  const { iat, exp } = jwt.verify(token, env.JWT_SECRET);
  assert.strictEqual(exp - iat, 2 * 24 * 60 * 60);
  let opts;
  setAuthCookie({ cookie: (_n, _v, o) => (opts = o) }, token);
  assert.strictEqual(opts.maxAge, 2 * 24 * 60 * 60 * 1000);
  assert.ok(opts.httpOnly);
});

test('an expired token is rejected', () => {
  const old = jwt.sign({ sub: 'u1', tv: 0 }, env.JWT_SECRET, { expiresIn: -10 });
  assert.throws(() => jwt.verify(old, env.JWT_SECRET), /expired/);
});
