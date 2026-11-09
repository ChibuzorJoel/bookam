const env = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/** Send an SMS to a normalised Nigerian number (234XXXXXXXXXX). Provider: Termii, or console for development. */
async function send(to, message) {
  if (env.SMS_PROVIDER === 'console') {
    logger.info(`[SMS -> ${to}] ${message}`);
    return { provider: 'console' };
  }

  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      from: env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: env.TERMII_CHANNEL,
      api_key: env.TERMII_API_KEY,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('Termii error', res.status, body);
    throw new AppError('Could not send SMS right now. Please try again.', 502, 'SMS_FAILED');
  }
  return body;
}

module.exports = { send };
