const env = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/** Send an SMS to a normalised Nigerian number (234XXXXXXXXXX). Provider: Termii, or console for development. */
async function send(to, message) {
  if (env.SMS_PROVIDER === 'console') {
    logger.info(`[SMS -> ${to}] ${message}`);
    return { provider: 'console' };
  }

  if (!env.TERMII_API_KEY) {
    logger.error('SMS_PROVIDER=termii but TERMII_API_KEY is empty. Add your Termii key to .env and restart the server.');
    throw new AppError('Could not send the SMS right now. Please try again in a minute.', 502, 'SMS_FAILED');
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
  // Termii answers { code: 'ok', message_id, balance } on success. Anything else is a failure, even on HTTP 200.
  if (!res.ok || (body.code && body.code !== 'ok')) {
    logger.error(`Termii SMS to ${to} failed: HTTP ${res.status} ${JSON.stringify(body)}`);
    throw new AppError('Could not send the SMS right now. Please try again in a minute.', 502, 'SMS_FAILED');
  }
  logger.info(`SMS sent to ${to} via Termii (message_id ${body.message_id}, balance ${body.balance})`);
  return body;
}

module.exports = { send };
