const { toDate, weekdayOf, minutesOf, hhmmFromMinutes, addMinutes, MIN } = require('./time');

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Pure slot generator (no database access, easy to unit test).
 *
 * Algorithm from the plan (section 7.4):
 *   opening hours for that weekday
 *   - blocked exceptions for that date
 *   - existing bookings (plus their buffer)
 *   -> split what remains into steps of (service duration + buffer).
 *
 * @param {object} p
 * @param {string} p.date          YYYY-MM-DD (Lagos calendar date)
 * @param {Array}  p.hours         business.hours [{weekday, openTime, closeTime, isClosed}]
 * @param {Array}  p.exceptions    business.exceptions [{date, startTime?, endTime?}]
 * @param {object} p.service       {durationMinutes, bufferMinutes}
 * @param {Array}  p.bookings      active bookings that day [{startAt, endAt, bufferMinutes}]
 * @param {Date}   p.now
 * @param {number} p.leadMinutes   minimum notice before a slot can be booked
 * @returns {Array<{time:string,startAt:Date,endAt:Date}>}
 */
function generateSlots({ date, hours, exceptions = [], service, bookings = [], now = new Date(), leadMinutes = 30 }) {
  const day = hours.find((h) => h.weekday === weekdayOf(date));
  if (!day || day.isClosed || !day.openTime || !day.closeTime) return [];

  const open = minutesOf(day.openTime);
  const close = minutesOf(day.closeTime);
  const duration = service.durationMinutes;
  const buffer = service.bufferMinutes || 0;
  const step = duration + buffer;
  if (!(duration > 0) || close <= open) return [];

  const midnight = toDate(date, '00:00');
  const at = (mins) => new Date(midnight.getTime() + mins * MIN);

  // Blocked intervals
  const blocks = [];
  for (const ex of exceptions) {
    if (ex.date !== date) continue;
    if (!ex.startTime || !ex.endTime) return []; // whole day off
    blocks.push([at(minutesOf(ex.startTime)), at(minutesOf(ex.endTime))]);
  }
  for (const b of bookings) {
    blocks.push([new Date(b.startAt), addMinutes(new Date(b.endAt), b.bufferMinutes || 0)]);
  }

  const earliest = addMinutes(now, leadMinutes);
  const slots = [];
  for (let m = open; m + duration <= close; m += step) {
    const startAt = at(m);
    const endAt = at(m + duration);
    if (startAt < earliest) continue;
    const occupiedEnd = at(m + duration + buffer);
    if (blocks.some(([bs, be]) => overlaps(startAt, occupiedEnd, bs, be))) continue;
    slots.push({ time: hhmmFromMinutes(m), startAt, endAt });
  }
  return slots;
}

module.exports = { generateSlots, overlaps };
