/**
 * Normalise a Nigerian mobile number to international format without "+": 234XXXXXXXXXX.
 * Accepts 08031234567, 8031234567, +2348031234567, 2348031234567, "0803 123 4567".
 * Returns null when the number is not a valid Nigerian mobile number.
 */
function normalizePhone(input) {
  if (!input) return null;
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('234')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^[789]\d{9}$/.test(d) ? `234${d}` : null;
}

/** Mask for public display: 2348031234567 -> 234803***4567 */
function maskPhone(p) {
  if (!p || p.length < 8) return p;
  return `${p.slice(0, 6)}***${p.slice(-4)}`;
}

module.exports = { normalizePhone, maskPhone };
