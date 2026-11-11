const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Payaza API client. Money in this file is NAIRA (Payaza's unit); the rest of the app uses KOBO, so conversion
 * happens at the edge (verifyTransaction returns kobo).
 * Docs: https://docs.payaza.africa  (auth = "Payaza <base64 public key>", test/live chosen by X-TenantID).
 */
const BASE = 'https://api.payaza.africa/live';
const tenant = () => (env.PAYAZA_MODE === 'Live' ? 'live' : 'test');

async function request(method, path, body) {
  if (!env.PAYAZA_PUBLIC_KEY) throw new AppError('Payments are not configured on this server.', 503, 'PAYMENTS_DISABLED');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Payaza ${Buffer.from(env.PAYAZA_PUBLIC_KEY).toString('base64')}`,
        'X-TenantID': tenant(),
        'X-ProductID': 'app',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    logger.error('Payaza network error', e.message);
    throw new AppError('Could not reach the payment provider. Please try again.', 502, 'PAYAZA_UNREACHABLE');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    logger.error('Payaza error', method, path, res.status, json.message || json.error || '');
    const err = new AppError(json.message || 'Payment provider error.', 502, 'PAYAZA_ERROR');
    err.upstreamStatus = res.status;
    throw err;
  }
  return json;
}

/**
 * x-payaza-signature = base64(HMAC-SHA512(rawBody, secret key)). We also accept the hex form of the same digest,
 * in case Payaza changes the encoding, because both prove the sender knows the secret.
 */
function isValidSignature(rawBody, signature) {
  if (!signature || !env.PAYAZA_SECRET_KEY || !Buffer.isBuffer(rawBody)) return false;
  const digest = crypto.createHmac('sha512', env.PAYAZA_SECRET_KEY).update(rawBody).digest();
  const given = String(signature).trim();
  return [digest.toString('base64'), digest.toString('hex')].some((expected) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/**
 * Looks the payment up by OUR reference. Returns { status: 'success'|'failed'|'pending', amount (kobo), fees (kobo),
 * paid_at }. Never throws for "not found / not paid yet" (Payaza answers 400 then), only for network problems.
 *
 * Amount check: Payaza reports amount_received and transaction_fee. We treat the payment as the full amount when
 * received >= expected, or received + fee >= expected (in case amount_received is shown after the fee). Anything
 * less is returned as the real (smaller) amount so settlement flags it as a mismatch.
 */
async function verifyTransaction(reference, expectedKobo) {
  let json;
  try {
    json = await request(
      'GET',
      `/merchant-collection/transfer_notification_controller/merchant/transaction-query?merchant_reference=${encodeURIComponent(reference)}`
    );
  } catch (e) {
    if (e.code === 'PAYAZA_ERROR' && [400, 404].includes(e.upstreamStatus)) return { status: 'pending', amount: 0, fees: 0 };
    throw e;
  }
  const d = json.data || {};
  const state = String(d.transaction_status || '').toLowerCase();
  if (state === 'failed') return { status: 'failed', amount: 0, fees: 0, raw: d };
  if (state !== 'completed') return { status: 'pending', amount: 0, fees: 0, raw: d };

  const received = Number(d.amount_received) || 0;
  const fee = Number(d.transaction_fee) || 0;
  const expected = (Number(expectedKobo) || 0) / 100;
  const paidInFull = expected > 0 && (received + 0.005 >= expected || received + fee + 0.005 >= expected);
  return {
    status: 'success',
    amount: paidInFull ? Number(expectedKobo) : Math.round(received * 100),
    fees: Math.round(fee * 100),
    paid_at: d.current_status_date || d.initiated_date,
    raw: d,
  };
}

let bankCache = { at: 0, data: [] };
async function listBanks() {
  if (Date.now() - bankCache.at < 24 * 60 * 60 * 1000 && bankCache.data.length) return bankCache.data;
  const json = await request('GET', '/payaza-account/api/v1/mainaccounts/merchant/banks/NGN');
  const rows = Array.isArray(json.data) ? json.data : [];
  const data = rows
    .filter((b) => b.active !== false && !b.block_transaction && b.type !== 'mobile_money')
    .map((b) => ({ name: b.name, code: String(b.code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), data };
  return data;
}

/** Returns { account_name }. Throws when the account cannot be verified. */
async function resolveAccount(accountNumber, bankCode) {
  const json = await request('POST', '/payaza-account/api/v1/mainaccounts/merchant/provider/enquiry', {
    service_payload: { currency: 'NGN', bank_code: bankCode, account_number: accountNumber },
  });
  const name = json.response_content?.account_name;
  if (!name) throw new AppError('Account not found.', 400, 'BANK_RESOLVE_FAILED');
  return { account_name: name };
}

/** Split account = the business's bank account. split_value is the PLATFORM's cut (percent); the business gets the rest. */
async function createSplitAccount(payload) {
  const json = await request('POST', '/settlement/settlement/merchant/split-account', payload);
  return { code: json.data.code, id: json.data.id };
}
async function updateSplitAccount(id, payload) {
  await request('PUT', `/settlement/settlement/merchant/split-account/${encodeURIComponent(id)}`, { ...payload, active: true });
}

module.exports = { isValidSignature, verifyTransaction, listBanks, resolveAccount, createSplitAccount, updateSplitAccount };
