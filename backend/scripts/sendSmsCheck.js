/* Sends one real test SMS so you can check your Termii setup before users try to sign up.
   Usage: npm run sms:test -- 08031234567 */
require('dotenv').config();
const env = require('../src/config/env');
const sms = require('../src/services/sms.service');
const { normalizePhone } = require('../src/utils/phone');

(async () => {
  const phone = normalizePhone(process.argv[2]);
  if (!phone) {
    console.error('Give a Nigerian mobile number, for example: npm run sms:test -- 08031234567');
    process.exit(1);
  }
  console.log(`Provider: ${env.SMS_PROVIDER}, channel: ${env.TERMII_CHANNEL}, sender: ${env.TERMII_SENDER_ID}`);
  const result = await sms.send(phone, `${env.PLATFORM_NAME} test message. If you can read this, SMS codes will reach your users.`);
  console.log('Result:', JSON.stringify(result));
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message, e.code || '');
  process.exit(1);
});
