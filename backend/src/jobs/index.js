const cron = require('node-cron');
const logger = require('../utils/logger');
const { Booking, Business } = require('../models');
const notifications = require('../services/notification.service');
const messages = require('../templates/messages');
const { PLANS } = require('../config/plans');

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

/** Hourly: downgrade lapsed paid plans to free, and warn owners 3 days before expiry. */
async function checkSubscriptions() {
  const now = new Date();

  const lapsed = await Business.updateMany({ plan: { $ne: 'free' }, planExpiresAt: { $lte: now } }, { $set: { plan: 'free' } });
  if (lapsed.modifiedCount) logger.info(`Downgraded ${lapsed.modifiedCount} lapsed plan(s) to free`);

  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiring = await Business.find({
    plan: { $ne: 'free' },
    planExpiresAt: { $gt: now, $lte: soon },
    renewalReminderFor: null, // matches "never reminded for this period"
  }).limit(200);

  for (const b of expiring) {
    // Mark first (atomic) so the reminder is sent only once per billing period
    const marked = await Business.updateOne({ _id: b._id, renewalReminderFor: null }, { $set: { renewalReminderFor: b.planExpiresAt } });
    if (!marked.modifiedCount) continue;
    await notifications.toOwner(b, 'subscription_expiring', 'Your plan is about to expire', messages.subscriptionExpiring({ plan: PLANS[b.plan]?.name || b.plan, endsAt: b.planExpiresAt }));
  }
}

function startJobs() {
  cron.schedule('* * * * *', safe('expireUnpaidHolds', expireUnpaidHolds));
  cron.schedule('*/10 * * * *', safe('sendReminders', sendReminders));
  cron.schedule('0 * * * *', safe('checkSubscriptions', checkSubscriptions));
  logger.info('Background jobs scheduled (hold expiry, reminders, subscription checks)');
}

module.exports = { startJobs, expireUnpaidHolds, sendReminders, checkSubscriptions };
