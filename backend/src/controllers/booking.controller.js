const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Booking, Service } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');
const { dayRange, toDate, addDaysStr } = require('../utils/time');
const { waLink } = require('../services/whatsapp.service');
const messages = require('../templates/messages');
const notifications = require('../services/notification.service');
const { rescheduleBooking } = require('../services/booking.service');

// GET /me/bookings?from=&to=&status=&page=&limit=
exports.listBookings = asyncHandler(async (req, res) => {
  const { from, to, status } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const filter = { businessId: req.business._id };
  if (status) filter.status = status;
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$gte = dayRange(from).start;
    if (to) filter.startAt.$lt = dayRange(to).end;
  }
  // hide abandoned/expired unpaid holds unless specifically asked for
  if (!status) filter.$nor = [{ status: 'cancelled', cancelReason: 'hold_expired' }];

  const [bookings, total] = await Promise.all([
    Booking.find(filter).sort({ startAt: from || to ? 1 : -1 }).skip(skip).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);

  const items = bookings.map((b) => ({
    ...b,
    // one tap on the dashboard opens WhatsApp to the customer with a pre-filled message
    customerWhatsappLink: waLink(b.customerPhone, messages.bookingWhatsAppToCustomer({ booking: b, business: req.business })),
  }));
  res.json({ status: 'success', data: { bookings: items, meta: pageMeta(page, limit, total) } });
});

// GET /me/bookings/:id
exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!booking) throw new AppError('Booking not found.', 404, 'NOT_FOUND');
  res.json({ status: 'success', data: { booking } });
});

const ALLOWED = {
  confirm: ['pending'],
  cancel: ['pending', 'confirmed'],
  complete: ['confirmed'],
  no_show: ['confirmed'],
  reschedule: ['pending', 'confirmed'],
};

// PATCH /me/bookings/:id  { action: confirm | cancel | complete | no_show | reschedule, date?, time?, reason? }
exports.updateBooking = asyncHandler(async (req, res) => {
  const { action, date, time, reason } = req.body;
  const booking = await Booking.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!booking) throw new AppError('Booking not found.', 404, 'NOT_FOUND');
  if (!ALLOWED[action].includes(booking.status)) {
    throw new AppError(`You cannot ${action.replace('_', ' ')} a booking that is ${booking.status}.`, 409, 'INVALID_STATE');
  }

  let result = booking;
  switch (action) {
    case 'confirm': // e.g. the customer paid by transfer, or the owner accepts without a deposit
      booking.status = 'confirmed';
      booking.holdExpiresAt = undefined;
      if (booking.paymentStatus === 'pending') booking.paymentStatus = 'not_required';
      await booking.save();
      notifications.background(notifications.bookingConfirmed(booking, req.business));
      break;

    case 'cancel':
      booking.status = 'cancelled';
      booking.cancelReason = reason || 'cancelled_by_business';
      // A paid deposit must be refunded by the business (money went straight to their account via the subaccount)
      if (booking.paymentStatus === 'paid') booking.paymentStatus = 'refund_required';
      else if (booking.paymentStatus === 'pending') booking.paymentStatus = 'failed';
      await booking.save();
      notifications.background(notifications.bookingCancelled(booking, req.business));
      break;

    case 'complete':
    case 'no_show':
      booking.status = action === 'complete' ? 'completed' : 'no_show';
      await booking.save();
      break;

    case 'reschedule': {
      const service = await Service.findOne({ _id: booking.serviceId, businessId: req.business._id });
      if (!service) throw new AppError('The service for this booking no longer exists.', 409, 'SERVICE_MISSING');
      result = await rescheduleBooking({ business: req.business, booking, service, date, time });
      notifications.background(notifications.bookingRescheduled(result, req.business));
      break;
    }
    default:
      break;
  }

  res.json({ status: 'success', data: { booking: result } });
});
