const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/me', require('./me.routes'));
router.use('/public', require('./public.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/billing', require('./billing.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
