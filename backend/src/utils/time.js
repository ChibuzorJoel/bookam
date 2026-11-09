// Lagos is UTC+01:00 all year (West Africa Time, no daylight saving), so a fixed offset is safe.
const TZ = 'Africa/Lagos';
const OFFSET = '+01:00';
const MIN = 60 * 1000;

const isValidDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00${OFFSET}`).getTime())
  && new Date(`${s}T12:00:00${OFFSET}`).toISOString().slice(0, 10) === s;

/** "2026-11-09" + "14:30" -> Date (the instant that is 14:30 in Lagos). */
const toDate = (dateStr, time = '00:00') => new Date(`${dateStr}T${time}:00${OFFSET}`);

/** Weekday (0 = Sunday ... 6 = Saturday) of a Lagos calendar date. */
const weekdayOf = (dateStr) => new Date(`${dateStr}T12:00:00${OFFSET}`).getUTCDay();

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const pad = (n) => String(n).padStart(2, '0');
const hhmmFromMinutes = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Today's calendar date in Lagos as YYYY-MM-DD. */
const todayLagos = (now = new Date()) => new Date(now.getTime() + 60 * MIN).toISOString().slice(0, 10);

const addDaysStr = (dateStr, days) =>
  new Date(toDate(dateStr, '12:00').getTime() + days * 24 * 60 * MIN + 0).toISOString().slice(0, 10);

/** UTC start (inclusive) and end (exclusive) of a Lagos calendar day. */
const dayRange = (dateStr) => {
  const start = toDate(dateStr, '00:00');
  return { start, end: new Date(start.getTime() + 24 * 60 * MIN) };
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * MIN);

const formatLagos = (date) =>
  new Intl.DateTimeFormat('en-NG', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(date));

module.exports = {
  TZ, OFFSET, MIN, isValidDateStr, toDate, weekdayOf, minutesOf, hhmmFromMinutes,
  todayLagos, addDaysStr, dayRange, addMinutes, formatLagos,
};
