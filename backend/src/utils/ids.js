const crypto = require('crypto');

// No 0/O/1/I/L to avoid confusion when customers read codes aloud or type them from a WhatsApp message.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

const generateBookingCode = () => `BK-${randomCode(6)}`;
const generateOrderCode = () => `OD-${randomCode(6)}`;
const generateReference = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomCode(6)}`;

module.exports = { generateBookingCode, generateOrderCode, generateReference };
