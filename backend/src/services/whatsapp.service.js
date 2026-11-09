const env = require('../config/env');
const { normalizePhone } = require('../utils/phone');

/**
 * PHASE 1 (free): click-to-chat link with a pre-filled message. The customer/owner taps it and WhatsApp opens.
 */
function waLink(phone, text) {
  const digits = normalizePhone(phone) || String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * PHASE 2: WhatsApp Business Cloud API. Requires a verified Meta business account and APPROVED message
 * templates. Enable with WHATSAPP_CLOUD_ENABLED=true. `templateName` must match an approved template whose
 * body has {{1}} (the message text). Adjust the components to match your approved templates.
 */
async function sendTemplate(to, templateName, bodyParams = []) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to) || to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: env.WHATSAPP_TEMPLATE_LANG },
        components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp Cloud API error ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

module.exports = { waLink, sendTemplate };
