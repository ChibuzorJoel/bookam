const test = require('node:test');
const assert = require('node:assert');
const { generateSlots } = require('../src/utils/slots');
const { toDate } = require('../src/utils/time');

// 2026-11-09 is a Monday (weekday 1)
const hours = [{ weekday: 1, openTime: '09:00', closeTime: '12:00', isClosed: false }];
const service = { durationMinutes: 60, bufferMinutes: 0 };
const now = new Date('2026-11-01T00:00:00Z');
const times = (slots) => slots.map((s) => s.time);

test('splits opening hours into service-length slots', () => {
  assert.deepStrictEqual(times(generateSlots({ date: '2026-11-09', hours, service, now })), ['09:00', '10:00', '11:00']);
});

test('removes slots taken by existing bookings', () => {
  const bookings = [{ startAt: toDate('2026-11-09', '10:00'), endAt: toDate('2026-11-09', '11:00'), bufferMinutes: 0 }];
  assert.deepStrictEqual(times(generateSlots({ date: '2026-11-09', hours, service, bookings, now })), ['09:00', '11:00']);
});

test('buffer time is added between appointments', () => {
  const buffered = { durationMinutes: 45, bufferMinutes: 15 };
  assert.deepStrictEqual(times(generateSlots({ date: '2026-11-09', hours, service: buffered, now })), ['09:00', '10:00', '11:00']);
});

test('closed days and whole-day exceptions return nothing', () => {
  assert.deepStrictEqual(generateSlots({ date: '2026-11-08', hours, service, now }), []); // Sunday, no entry
  assert.deepStrictEqual(generateSlots({ date: '2026-11-09', hours, service, exceptions: [{ date: '2026-11-09' }], now }), []);
});

test('partial exceptions block only that window', () => {
  const exceptions = [{ date: '2026-11-09', startTime: '09:30', endTime: '10:30' }];
  assert.deepStrictEqual(times(generateSlots({ date: '2026-11-09', hours, service, exceptions, now })), ['11:00']);
});

test('slots in the past (or inside the lead time) are hidden', () => {
  const lateNow = new Date(toDate('2026-11-09', '09:45').getTime());
  assert.deepStrictEqual(times(generateSlots({ date: '2026-11-09', hours, service, now: lateNow })), ['11:00']);
});
