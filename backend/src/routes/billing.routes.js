const router = require('express').Router();
const c = require('../controllers/billing.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { protect, restrictTo, loadBusiness } = require('../middleware/auth');

router.get('/plans', c.listPlans); // public: pricing page

router.use(protect, restrictTo('owner'), loadBusiness);
router.post('/subscribe', validate(v.subscribe), c.subscribe);
router.get('/status', c.status);

module.exports = router;
