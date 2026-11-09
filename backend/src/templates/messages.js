// Every customer/owner message lives here so wording can change without touching business logic.
const env = require('../config/env');
const { formatNaira } = require('../utils/money');
const { formatLagos } = require('../utils/time');

const P = env.PLATFORM_NAME;

module.exports = {
  emailCodeSubject: () => `Your ${P} email code`,
  emailCode: ({ code, minutes }) => `Your ${P} email verification code is ${code}.\n\nIt expires in ${minutes} minutes. If you did not ask for this, you can ignore this email. Never share this code.`,
  otp: ({ code, minutes }) => `Your ${P} code is ${code}. It expires in ${minutes} minutes. Never share this code.`,

  bookingConfirmedCustomer: ({ booking, business }) =>
    `Hi ${booking.customerName}, your booking with ${business.name} is confirmed!\n` +
    `${booking.serviceName}\n${formatLagos(booking.startAt)}\n` +
    (business.address ? `Location: ${business.address}\n` : '') +
    `Booking code: ${booking.bookingCode}`,

  bookingConfirmedOwner: ({ booking, business }) =>
    `New booking for ${business.name}: ${booking.customerName} (${booking.customerPhone}) booked ${booking.serviceName} ` +
    `on ${formatLagos(booking.startAt)}. ` +
    (booking.depositAmount ? `Deposit paid: ${formatNaira(booking.depositAmount)}. ` : '') +
    `Code: ${booking.bookingCode}`,

  bookingCancelledCustomer: ({ booking, business }) =>
    `Hi ${booking.customerName}, your booking ${booking.bookingCode} with ${business.name} for ${formatLagos(booking.startAt)} has been cancelled.` +
    (booking.paymentStatus === 'refund_required' ? ' Your deposit will be refunded by the business.' : ''),

  bookingRescheduledCustomer: ({ booking, business }) =>
    `Hi ${booking.customerName}, your booking ${booking.bookingCode} with ${business.name} has been moved to ${formatLagos(booking.startAt)}.`,

  reminderCustomer: ({ booking, business, hoursBefore }) =>
    `Reminder: you have ${booking.serviceName} at ${business.name} ${hoursBefore === 2 ? 'in about 2 hours' : 'tomorrow'} (${formatLagos(booking.startAt)}). Code: ${booking.bookingCode}`,

  reminderOwner: ({ booking, business, hoursBefore }) =>
    `Reminder: ${booking.customerName} - ${booking.serviceName} ${hoursBefore === 2 ? 'in about 2 hours' : 'tomorrow'} (${formatLagos(booking.startAt)}).`,

  newOrderOwner: ({ order, business }) =>
    `New order ${order.orderCode} for ${business.name} from ${order.customerName} (${order.customerPhone}): ` +
    `${order.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}. Total ${formatNaira(order.total)}.`,

  // Text of the pre-filled WhatsApp message the customer sends to the business
  orderWhatsApp: ({ order, business }) =>
    `Hello ${business.name}, I would like to order:\n` +
    order.items.map((i) => `- ${i.qty} x ${i.name} = ${formatNaira(i.price * i.qty)}`).join('\n') +
    `\n\nTotal: ${formatNaira(order.total)}\nName: ${order.customerName}\nOrder ref: ${order.orderCode}`,

  bookingWhatsAppFromCustomer: ({ booking, business }) =>
    `Hello ${business.name}, this is ${booking.customerName}. I booked ${booking.serviceName} for ${formatLagos(booking.startAt)}. Booking code: ${booking.bookingCode}`,

  bookingWhatsAppToCustomer: ({ booking, business }) =>
    `Hello ${booking.customerName}, this is ${business.name}. Your ${booking.serviceName} booking for ${formatLagos(booking.startAt)} is noted. Code: ${booking.bookingCode}`,

  refundRequiredOwner: ({ booking, business }) =>
    `Action needed: a deposit of ${formatNaira(booking.depositAmount)} was paid for booking ${booking.bookingCode} but the slot was no longer free. Please refund the customer (${booking.customerName}, ${booking.customerPhone}).`,

  subscriptionActivated: ({ plan, endsAt }) =>
    `Your ${P} ${plan} plan is active until ${formatLagos(endsAt)}. Thank you!`,

  subscriptionExpiring: ({ plan, endsAt }) =>
    `Your ${P} ${plan} plan expires on ${formatLagos(endsAt)}. Renew from Dashboard > Billing to keep your features.`,
};
