const router = require('express').Router();
const c = require('../controllers/admin.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin'));

router.get('/businesses', validate(v.adminBusinessList, 'query'), c.listBusinesses);
router.patch('/businesses/:id', validate(v.idParam, 'params'), validate(v.adminBusinessUpdate), c.updateBusiness);
router.get('/stats', c.stats);

module.exports = router;
