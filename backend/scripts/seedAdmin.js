// Usage: set ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD in .env then run: npm run seed:admin
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User } = require('../src/models');
const { normalizePhone } = require('../src/utils/phone');

(async () => {
  const phone = normalizePhone(env.ADMIN_PHONE);
  if (!phone || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) {
    console.error('Set a valid ADMIN_PHONE and an ADMIN_PASSWORD (min 8 chars) in your .env file.');
    process.exit(1);
  }
  await connectDB();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await User.findOneAndUpdate(
    { phone },
    { $set: { role: 'admin', phoneVerified: true, status: 'active', passwordHash, ...(env.ADMIN_EMAIL ? { email: env.ADMIN_EMAIL.toLowerCase() } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Admin ready: ${admin.phone} (${admin.email || 'no email'}). Log in with POST /auth/login.`);
  await disconnectDB();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
