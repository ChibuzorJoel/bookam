const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const BASE = 'https://api.paystack.co';

async function request(method, path, body) {
  if (!env.PAYSTACK_SECRET_KEY) throw new AppError('Payments are not configured on this server.', 503, 'PAYMENTS_DISABLED');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    logger.error('Paystack network error', e.message);
    throw new AppError('Could not reach the payment provider. Please try again.', 502, 'PAYSTACK_UNREACHABLE');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    logger.error('Paystack error', method, path, res.status, json.message);
    throw new AppError(json.message || 'Payment provider error.', res.status === 404 ? 404 : 502, 'PAYSTACK_ERROR');
  }
  return json.data;
}

/** amount is in kobo. Returns { authorization_url, access_code, reference }. */
const initializeTransaction = (payload) => request('POST', '/transaction/initialize', payload);

/** Server-side verification. Never trust the browser redirect; trust this (and the webhook). */
const verifyTransaction = (reference) => request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);

const createSubaccount = (payload) => request('POST', '/subaccount', payload);
const updateSubaccount = (code, payload) => request('PUT', `/subaccount/${encodeURIComponent(code)}`, payload);
const resolveAccount = (accountNumber, bankCode) =>
  request('GET', `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);

let bankCache = { at: 0, data: [] };
async function listBanks() {
  if (Date.now() - bankCache.at < 24 * 60 * 60 * 1000 && bankCache.data.length) return bankCache.data;
  const data = await request('GET', '/bank?country=nigeria&perPage=200&use_cursor=false');
  bankCache = { at: Date.now(), data: data.map((b) => ({ name: b.name, code: b.code })) };
  return bankCache.data;
}

module.exports = { initializeTransaction, verifyTransaction, createSubaccount, updateSubaccount, resolveAccount, listBanks };
