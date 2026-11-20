const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const push = require('../services/push.service');

// GET /me/push/key  -> whether the server can send pushes, and the public key the browser needs
exports.key = asyncHandler(async (_req, res) => {
  res.json({ status: 'success', data: { enabled: push.enabled(), publicKey: push.enabled() ? env.VAPID_PUBLIC_KEY : null } });
});

// POST /me/push  { endpoint, keys: { p256dh, auth } }
exports.subscribe = asyncHandler(async (req, res) => {
  await push.subscribe({ userId: req.user._id, businessId: req.business._id, subscription: req.body, userAgent: req.get('user-agent') });
  res.status(201).json({ status: 'success', data: {} });
});

// DELETE /me/push  { endpoint }
exports.unsubscribe = asyncHandler(async (req, res) => {
  await push.unsubscribe({ userId: req.user._id, endpoint: req.body.endpoint });
  res.json({ status: 'success', data: {} });
});

// POST /me/push/test  -> sends a test notification to the owner's devices
exports.test = asyncHandler(async (req, res) => {
  const r = await push.notifyBusiness(req.business._id, { title: 'Bookam notifications are on', body: 'You will hear about new bookings and orders here.', tag: 'test' });
  res.json({ status: 'success', data: r });
});
