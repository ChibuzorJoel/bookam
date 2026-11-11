const crypto = require('crypto');

// Slugs that would collide with frontend routes or API paths.
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', 'billing', 'dashboard', 'login', 'signup', 'logout', 'me', 'public', 'payments',
  'health', 'pricing', 'about', 'terms', 'privacy', 'support', 'help', 'static', 'assets', 'bookings',
  'orders', 'cart', 'refunds', 'legal', 'cookies', 'contact', 'by-domain', 'webhook', 'book', 'item', 'booking', 'www', 'app', 'root', 'null', 'undefined',
]);

function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const randomSuffix = () => String(crypto.randomInt(1000, 9999));

module.exports = { RESERVED_SLUGS, slugify, randomSuffix };
