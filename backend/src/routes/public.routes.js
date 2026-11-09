// No login required. Rate limited because anyone on the internet can call these.
const router = require('express').Router();
const c = require('../controllers/public.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { publicWriteLimiter } = require('../middleware/rateLimit');

// Static paths first so "bookings" and "by-domain" are never mistaken for a business slug.
router.get('/by-domain', validate(v.domainQuery, 'query'), c.getByDomain);
router.get('/bookings/:code', validate(v.codeParam, 'params'), c.getBookingByCode);

router.get('/:slug', validate(v.slugParam, 'params'), c.getPage);
router.get('/:slug/availability', validate(v.slugParam, 'params'), validate(v.availabilityQuery, 'query'), c.getAvailability);
router.post('/:slug/bookings', publicWriteLimiter, validate(v.slugParam, 'params'), validate(v.publicBookingCreate), c.createBooking);
router.post('/:slug/orders', publicWriteLimiter, validate(v.slugParam, 'params'), validate(v.publicOrderCreate), c.createOrder);

module.exports = router;
