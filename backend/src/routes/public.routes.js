// No login required. Rate limited because anyone on the internet can call these.
const router = require('express').Router();
const c = require('../controllers/public.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { publicWriteLimiter, assistantLimiter, supportLimiter } = require('../middleware/rateLimit');
const extra = require('../controllers/adminExtra.controller');
const assistant = require('../controllers/assistant.controller');

// Static paths first so "bookings" and "by-domain" are never mistaken for a business slug.
router.post('/support', supportLimiter, validate(v.supportCreate), extra.createSupport);
router.post('/assistant', assistantLimiter, validate(v.assistantChat), assistant.chat);
router.get('/by-domain', validate(v.domainQuery, 'query'), c.getByDomain);
router.get('/bookings/:code', validate(v.codeParam, 'params'), c.getBookingByCode);
router.post('/bookings/:code/review', publicWriteLimiter, validate(v.codeParam, 'params'), validate(v.reviewCreate), c.createReview);
router.get('/orders/:code', validate(v.codeParam, 'params'), c.getOrderByCode);

router.get('/:slug', validate(v.slugParam, 'params'), c.getPage);
router.get('/:slug/reviews', validate(v.slugParam, 'params'), validate(v.reviewListQuery, 'query'), c.listReviews);
router.get('/:slug/availability', validate(v.slugParam, 'params'), validate(v.availabilityQuery, 'query'), c.getAvailability);
router.post('/:slug/bookings', publicWriteLimiter, validate(v.slugParam, 'params'), validate(v.publicBookingCreate), c.createBooking);
router.post('/:slug/orders', publicWriteLimiter, validate(v.slugParam, 'params'), validate(v.publicOrderCreate), c.createOrder);

module.exports = router;
