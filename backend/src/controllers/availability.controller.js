const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// GET /me/hours  (hours + blocked dates)
exports.getHours = asyncHandler(async (req, res) => {
  res.json({ status: 'success', data: { hours: req.business.hours, exceptions: req.business.exceptions } });
});

// PUT /me/hours  (replace the whole weekly schedule)
exports.putHours = asyncHandler(async (req, res) => {
  req.business.hours = req.body.hours
    .map((h) => ({ weekday: h.weekday, isClosed: h.isClosed, openTime: h.isClosed ? undefined : h.openTime, closeTime: h.isClosed ? undefined : h.closeTime }))
    .sort((a, b) => a.weekday - b.weekday);
  await req.business.save();
  res.json({ status: 'success', data: { hours: req.business.hours } });
});

// POST /me/exceptions  (block a whole date, or a time window on a date)
exports.addException = asyncHandler(async (req, res) => {
  if (req.business.exceptions.length >= 365) throw new AppError('Too many blocked dates. Remove some old ones first.', 400, 'LIMIT');
  req.business.exceptions.push(req.body);
  await req.business.save();
  res.status(201).json({ status: 'success', data: { exceptions: req.business.exceptions } });
});

// DELETE /me/exceptions/:id
exports.removeException = asyncHandler(async (req, res) => {
  const ex = req.business.exceptions.id(req.params.id);
  if (!ex) throw new AppError('Blocked date not found.', 404, 'NOT_FOUND');
  ex.deleteOne();
  await req.business.save();
  res.json({ status: 'success', data: { exceptions: req.business.exceptions } });
});
