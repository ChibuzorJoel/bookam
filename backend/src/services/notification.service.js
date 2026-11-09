const env = require('../config/env');
const logger = require('../utils/logger');
const { Notification, User } = require('../models');
const sms = require('./sms.service');
const email = require('./email.service');
const whatsapp = require('./whatsapp.service');
const messages = require('../templates/messages');
const { hasFeature } = require('../middleware/planGuard');

/** Sends one message on one channel and records the outcome. NEVER throws: a failed SMS must not break a booking. */
async function deliver({ businessId, bookingId, type, channel, recipient, subject, message }) {
  if (!recipient) return;
  let record;
  try {
    record = await Notification.create({ businessId, bookingId, type, channel, recipient, status: 'queued' });
    if (channel === 'sms') await sms.send(recipient, message);
    else if (channel === 'email') await email.send({ to: recipient, subject: subject || type, text: message });
    else if (channel === 'whatsapp') await whatsapp.sendTemplate(recipient, `platform_${type}`, [message]);
    // 'whatsapp_link' needs no sending: the link is returned to the client. We only log that it was generated.
    record.status = channel === 'whatsapp_link' ? 'link_generated' : 'sent';
    record.sentAt = new Date();
    await record.save();
  } catch (err) {
    logger.error(`Notification failed (${type}/${channel})`, err.message);
    if (record) {
      record.status = 'failed';
      record.error = String(err.message).slice(0, 300);
      await record.save().catch(() => {});
    }
  }
}

const ownerOf = (business) => User.findById(business.ownerId).select('phone email');

/** Builds the list of channel deliveries for a customer + owner pair. */
function fanOut({ business, booking, owner, type, customerText, ownerText, subject, ownerSubject }) {
  const base = { businessId: business._id, bookingId: booking?._id, type };
  const jobs = [];

  if (booking) {
    if (booking.customerEmail) jobs.push(deliver({ ...base, channel: 'email', recipient: booking.customerEmail, subject, message: customerText }));
    if (env.NOTIFY_SMS) jobs.push(deliver({ ...base, channel: 'sms', recipient: booking.customerPhone, message: customerText }));
    if (env.WHATSAPP_CLOUD_ENABLED) jobs.push(deliver({ ...base, channel: 'whatsapp', recipient: booking.customerPhone, message: customerText }));
  }
  if (owner?.email) jobs.push(deliver({ ...base, channel: 'email', recipient: owner.email, subject: ownerSubject || subject, message: ownerText }));
  if (env.NOTIFY_SMS && owner?.phone) jobs.push(deliver({ ...base, channel: 'sms', recipient: owner.phone, message: ownerText }));
  if (env.WHATSAPP_CLOUD_ENABLED && business.whatsappNumber) jobs.push(deliver({ ...base, channel: 'whatsapp', recipient: business.whatsappNumber, message: ownerText }));
  if (business.whatsappNumber) jobs.push(deliver({ ...base, channel: 'whatsapp_link', recipient: business.whatsappNumber, message: ownerText }));
  return Promise.allSettled(jobs);
}

async function bookingConfirmed(booking, business) {
  const owner = await ownerOf(business);
  return fanOut({
    business, booking, owner, type: 'booking_confirmed',
    subject: `Booking confirmed - ${booking.bookingCode}`,
    ownerSubject: `New booking - ${booking.customerName}`,
    customerText: messages.bookingConfirmedCustomer({ booking, business }),
    ownerText: messages.bookingConfirmedOwner({ booking, business }),
  });
}

async function bookingCancelled(booking, business) {
  const owner = await ownerOf(business);
  const text = messages.bookingCancelledCustomer({ booking, business });
  return fanOut({ business, booking, owner, type: 'booking_cancelled', subject: `Booking cancelled - ${booking.bookingCode}`, customerText: text, ownerText: text });
}

async function bookingRescheduled(booking, business) {
  const owner = await ownerOf(business);
  const text = messages.bookingRescheduledCustomer({ booking, business });
  return fanOut({ business, booking, owner, type: 'booking_rescheduled', subject: `Booking moved - ${booking.bookingCode}`, customerText: text, ownerText: text });
}

async function bookingReminder(booking, business, hoursBefore) {
  if (!hasFeature(business, 'reminders')) return; // reminders are a Pro feature
  const owner = await ownerOf(business);
  return fanOut({
    business, booking, owner, type: `reminder_${hoursBefore}h`, subject: `Reminder - ${booking.serviceName}`,
    customerText: messages.reminderCustomer({ booking, business, hoursBefore }),
    ownerText: messages.reminderOwner({ booking, business, hoursBefore }),
  });
}

async function refundRequired(booking, business) {
  const owner = await ownerOf(business);
  const text = messages.refundRequiredOwner({ booking, business });
  const base = { businessId: business._id, bookingId: booking._id, type: 'refund_required' };
  const jobs = [];
  if (owner?.email) jobs.push(deliver({ ...base, channel: 'email', recipient: owner.email, subject: 'Refund needed', message: text }));
  if (owner?.phone) jobs.push(deliver({ ...base, channel: 'sms', recipient: owner.phone, message: text }));
  return Promise.allSettled(jobs);
}

async function newOrder(order, business) {
  const owner = await ownerOf(business);
  const text = messages.newOrderOwner({ order, business });
  const base = { businessId: business._id, type: 'new_order' };
  const jobs = [];
  if (owner?.email) jobs.push(deliver({ ...base, channel: 'email', recipient: owner.email, subject: `New order ${order.orderCode}`, message: text }));
  if (env.NOTIFY_SMS && owner?.phone) jobs.push(deliver({ ...base, channel: 'sms', recipient: owner.phone, message: text }));
  return Promise.allSettled(jobs);
}

/** Subscription notices go to the owner only. */
async function toOwner(business, type, subject, text) {
  const owner = await ownerOf(business);
  const base = { businessId: business._id, type };
  return Promise.allSettled([
    owner?.email && deliver({ ...base, channel: 'email', recipient: owner.email, subject, message: text }),
    owner?.phone && deliver({ ...base, channel: 'sms', recipient: owner.phone, message: text }),
  ].filter(Boolean));
}

/** Fire-and-forget helper for controllers: never blocks the HTTP response and never throws. */
const background = (promise) => {
  Promise.resolve(promise).catch((e) => logger.error('Background notification error', e.message));
};

module.exports = {
  deliver, background, bookingConfirmed, bookingCancelled, bookingRescheduled, bookingReminder,
  refundRequired, newOrder, toOwner,
};
