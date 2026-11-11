const cron = require('node-cron');
const logger = require('../utils/logger');
const env = require('../config/env');
const { Booking, Business, Subscription } = require('../models');
const notifications = require('../services/notification.service');
const messages = require('../templates/messages');
const { PLANS, ANNUAL_MONTHS_CHARGED } = require('../config/plans');

/** Runs a job and logs (never throws) so one failure cannot stop the scheduler. */
const safe = (name, fn) => async () => {
  try {
    await fn();
  } catch (err) {
    logger.error(`Job "${name}" failed:`, err.message);
  }
};

/**
 * Every minute: cancel pending bookings whose hold ran out and free the slot.
 * (A TTL index would DELETE the record; we want to keep it for history and for late-payment handling.)
 */
async function expireUnpaidHolds() {
  const res = await Booking.updateMany(
    { status: 'pending', holdExpiresAt: { $lte: new Date() } },
    { $set: { status: 'cancelled', slotActive: false, paymentStatus: 'failed', cancelReason: 'hold_expired' } }
  );
  if (res.modifiedCount) logger.info(`Released ${res.modifiedCount} expired booking hold(s)`);
}

/**
 * Every 10 minutes: reminders 24h and 2h before the appointment.
 * Each reminder is "claimed" atomically before sending, so running several server instances never double-sends.
 */
async function sendReminders() {
  const now = Date.now();
  const windows = [
    { key: 'h24', hours: 24, lowerHours: 2 },  // between 2h and 24h away (anything closer gets the 2h reminder)
    { key: 'h2', hours: 2, lowerHours: 0 },
  ];

  for (const w of windows) {
    const candidates = await Booking.find({
      status: 'confirmed',
      startAt: { $gt: new Date(now + w.lowerHours * 3600 * 1000), $lte: new Date(now + w.hours * 3600 * 1000) },
      [`remindersSent.${w.key}`]: false,
    }).limit(300);

    for (const candidate of candidates) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: candidate._id, status: 'confirmed', [`remindersSent.${w.key}`]: false },
        { $set: { [`remindersSent.${w.key}`]: true } },
        { new: true }
      );
      if (!claimed) continue;
      const business = await Business.findById(claimed.businessId);
      if (business?.status === 'active') await notifications.bookingReminder(claimed, business, w.hours);
    }
  }
}

/**
 * Hourly: renewal notices at 7, 3 and 1 day before a paid plan ends, one more when it ends, then downgrade to free.
 * Every notice is "claimed" atomically ('<expiry>:<stage>' added to renewalSent) before sending, so it goes out once
 * per billing period even with several server instances, and a new payment resets the list.
 */
const DAY = 24 * 60 * 60 * 1000;
const STAGES = [
  { key: 'd1', days: 1 },
  { key: 'd3', days: 3 },
  { key: 'd7', days: 7 },
];

const claimNotice = async (business, stage) => {
  const marker = `${new Date(business.planExpiresAt).getTime()}:${stage}`;
  const res = await Business.updateOne({ _id: business._id, renewalSent: { $ne: marker } }, { $addToSet: { renewalSent: marker } });
  return res.modifiedCount === 1;
};

async function checkSubscriptions() {
  const now = new Date();
  const link = `${env.PUBLIC_BASE_URL}/dashboard/billing`;

  // 1) Plans that have ended: tell the owner once, then downgrade.
  const lapsed = await Business.find({ plan: { $ne: 'free' }, planExpiresAt: { $lte: now } }).limit(200);
  for (const b of lapsed) {
    if (await claimNotice(b, 'ended')) {
      await notifications.toOwner(b, 'subscription_ended', 'Your plan has ended', messages.subscriptionEnded({ plan: PLANS[b.plan]?.name || b.plan, link }));
    }
    // Only downgrade if it was not renewed while we were sending.
    await Business.updateOne({ _id: b._id, planExpiresAt: b.planExpiresAt }, { $set: { plan: 'free' } });
  }
  if (lapsed.length) logger.info(`Downgraded ${lapsed.length} lapsed plan(s) to free`);

  // 2) Upcoming expiry: send the tightest stage that applies (a business 2 days out gets the 3-day notice, not 7).
  const horizon = new Date(now.getTime() + 7 * DAY);
  const expiring = await Business.find({ plan: { $ne: 'free' }, planExpiresAt: { $gt: now, $lte: horizon } }).limit(300);
  for (const b of expiring) {
    const left = b.planExpiresAt.getTime() - now.getTime();
    const stage = STAGES.find((s) => left <= s.days * DAY);
    if (!stage) continue;
    // If a tighter stage already went out, do not send a looser one.
    if (!(await claimNotice(b, stage.key))) continue;
    const plan = PLANS[b.plan];
    const lastPaid = await Subscription.findOne({ businessId: b._id, status: 'active' }).sort({ createdAt: -1 }).select('period');
    const yearlySaving = lastPaid?.period === 'annual' ? 0 : plan.priceKobo * (12 - ANNUAL_MONTHS_CHARGED);
    await notifications.toOwner(
      b,
      'subscription_expiring',
      'Your plan is about to end',
      messages.subscriptionExpiring({ plan: plan?.name || b.plan, endsAt: b.planExpiresAt, days: stage.days, link, yearlySaving })
    );
  }
}

function startJobs() {
  cron.schedule('* * * * *', safe('expireUnpaidHolds', expireUnpaidHolds));
  cron.schedule('*/10 * * * *', safe('sendReminders', sendReminders));
  cron.schedule('0 * * * *', safe('checkSubscriptions', checkSubscriptions));
  logger.info('Background jobs scheduled (hold expiry, reminders, subscription checks)');
}

module.exports = { startJobs, expireUnpaidHolds, sendReminders, checkSubscriptions };
