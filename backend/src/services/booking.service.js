const { Booking, DayLock } = require('../models');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { generateBookingCode } = require('../utils/ids');
const { generateSlots } = require('../utils/slots');
const { runInTransaction } = require('../utils/tx');
const { toDate, dayRange, addMinutes, todayLagos, addDaysStr } = require('../utils/time');

/** Frees unpaid holds whose time ran out so they stop blocking the slot (and the unique index). */
async function releaseExpiredHolds(businessId, session = null) {
  return Booking.updateMany(
    { businessId, status: 'pending', holdExpiresAt: { $lte: new Date() } },
    { $set: { status: 'cancelled', slotActive: false, paymentStatus: 'failed', cancelReason: 'hold_expired' } },
    { session }
  );
}

/** Open slots for a service on a date. Reads inside the given session when called from a transaction. */
async function getSlotsForDate(business, service, date, { session = null, excludeBookingId = null } = {}) {
  const { start, end } = dayRange(date);
  const query = { businessId: business._id, slotActive: true, startAt: { $gte: start, $lt: end } };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };
  const bookings = await Booking.find(query).select('startAt endAt bufferMinutes').session(session).lean();

  return generateSlots({
    date,
    hours: business.hours || [],
    exceptions: business.exceptions || [],
    service,
    bookings,
  });
}

/** Rejects dates in the past or too far ahead. */
function assertBookableDate(date) {
  const today = todayLagos();
  if (date < today) throw new AppError('That date has already passed.', 400, 'DATE_IN_PAST');
  if (date > addDaysStr(today, env.MAX_ADVANCE_BOOKING_DAYS)) {
    throw new AppError(`Bookings can only be made up to ${env.MAX_ADVANCE_BOOKING_DAYS} days ahead.`, 400, 'DATE_TOO_FAR');
  }
}

const slotTaken = () => new AppError('That time slot was just taken. Please pick another time.', 409, 'SLOT_TAKEN');

/**
 * Creates a booking safely (plan section 7.4):
 *  1. open a transaction
 *  2. touch the per-day lock document so concurrent attempts for the same day serialise
 *  3. release expired holds, re-generate the open slots and check the requested time is still in them
 *  4. insert as 'pending' with a temporary hold (or 'confirmed' straight away when no deposit is needed)
 *  5. the partial unique index is the final safety net: a duplicate start time raises E11000 -> 409
 */
async function createBooking({ business, service, date, time, customer }) {
  assertBookableDate(date);
  const startAt = toDate(date, time);
  const endAt = addMinutes(startAt, service.durationMinutes);
  const needsDeposit = service.depositAmount > 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runInTransaction(async (session) => {
        await DayLock.updateOne({ businessId: business._id, date }, { $inc: { v: 1 } }, { upsert: true, session });
        await releaseExpiredHolds(business._id, session);

        const slots = await getSlotsForDate(business, service, date, { session });
        if (!slots.some((s) => s.time === time)) throw slotTaken();

        const [booking] = await Booking.create(
          [
            {
              businessId: business._id,
              serviceId: service._id,
              serviceName: service.name,
              customerName: customer.customerName,
              customerPhone: customer.customerPhone,
              customerEmail: customer.customerEmail,
              notes: customer.notes,
              startAt,
              endAt,
              bufferMinutes: service.bufferMinutes || 0,
              price: service.price,
              depositAmount: service.depositAmount,
              status: needsDeposit ? 'pending' : 'confirmed',
              paymentStatus: needsDeposit ? 'pending' : 'not_required',
              holdExpiresAt: needsDeposit ? addMinutes(new Date(), env.BOOKING_HOLD_MINUTES) : undefined,
              bookingCode: generateBookingCode(),
            },
          ],
          { session }
        );
        return booking;
      });
    } catch (err) {
      if (err.code === 11000) {
        // Same start time already taken, or (very rarely) a booking code collision: retry once more for the latter.
        if (err.keyPattern?.bookingCode) continue;
        throw slotTaken();
      }
      throw err;
    }
  }
  throw new AppError('Could not create the booking. Please try again.', 500, 'BOOKING_FAILED');
}

/** Moves an existing booking to a new date/time with the same safety checks. */
async function rescheduleBooking({ business, booking, service, date, time }) {
  assertBookableDate(date);
  const startAt = toDate(date, time);
  const endAt = addMinutes(startAt, service.durationMinutes);

  try {
    return await runInTransaction(async (session) => {
      await DayLock.updateOne({ businessId: business._id, date }, { $inc: { v: 1 } }, { upsert: true, session });
      await releaseExpiredHolds(business._id, session);

      const slots = await getSlotsForDate(business, service, date, { session, excludeBookingId: booking._id });
      if (!slots.some((s) => s.time === time)) throw slotTaken();

      const fresh = await Booking.findOne({ _id: booking._id, businessId: business._id }).session(session);
      if (!fresh || !['pending', 'confirmed'].includes(fresh.status)) {
        throw new AppError('Only pending or confirmed bookings can be rescheduled.', 409, 'INVALID_STATE');
      }
      fresh.startAt = startAt;
      fresh.endAt = endAt;
      fresh.remindersSent = { h24: false, h2: false };
      await fresh.save({ session });
      return fresh;
    });
  } catch (err) {
    if (err.code === 11000) throw slotTaken();
    throw err;
  }
}

module.exports = { releaseExpiredHolds, getSlotsForDate, assertBookableDate, createBooking, rescheduleBooking };
