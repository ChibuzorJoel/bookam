const webpush = require('web-push');
const env = require('../config/env');
const logger = require('../utils/logger');
const { PushSubscription } = require('../models');

const enabled = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
let configured = false;

function configure() {
  if (configured || !enabled()) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

/** Tells every device this business's owner enabled. Never throws. Dead devices (404/410) are removed. */
async function notifyBusiness(businessId, { title, body, url = '/dashboard', tag }) {
  if (!enabled()) return { sent: 0, removed: 0 };
  try {
    configure();
    const subs = await PushSubscription.find({ businessId }).lean();
    const payload = JSON.stringify({ title, body: String(body).slice(0, 200), url, tag });
    let sent = 0;
    const dead = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 12, urgency: 'high' });
          sent += 1;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(s._id);
          else logger.error(`Push failed (${err.statusCode || 'network'}): ${err.message}`);
        }
      })
    );
    if (dead.length) await PushSubscription.deleteMany({ _id: { $in: dead } });
    return { sent, removed: dead.length };
  } catch (err) {
    logger.error('Push error', err.message);
    return { sent: 0, removed: 0 };
  }
}

async function subscribe({ userId, businessId, subscription, userAgent }) {
  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { userId, businessId, endpoint: subscription.endpoint, keys: subscription.keys, userAgent: String(userAgent || '').slice(0, 300) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Only removes the caller's own subscription. */
const unsubscribe = ({ userId, endpoint }) => PushSubscription.deleteOne({ userId, endpoint });

module.exports = { enabled, notifyBusiness, subscribe, unsubscribe };
