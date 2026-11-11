const router = require('express').Router();
const c = require('../controllers/payment.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { webhookLimiter, publicWriteLimiter } = require('../middleware/rateLimit');

// The raw-body parser for this path is registered in app.js BEFORE express.json().
router.post('/webhook/paystack', webhookLimiter, c.paystackWebhook);
router.post('/webhook/payaza', webhookLimiter, c.payazaWebhook);
router.get('/verify/:reference', publicWriteLimiter, validate(v.referenceParam, 'params'), c.verifyPayment);

module.exports = router;
