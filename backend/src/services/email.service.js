const env = require('../config/env');
const logger = require('../utils/logger');

/** Send a plain-text email. Provider: Resend, or console for development. */
async function send({ to, subject, text }) {
  if (env.EMAIL_PROVIDER === 'console') {
    logger.info(`[EMAIL -> ${to}] ${subject}\n${text}`);
    return { provider: 'console' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

module.exports = { send };
