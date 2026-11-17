const router = require('express').Router();
const c = require('../controllers/admin.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const extra = require('../controllers/adminExtra.controller');
const assistant = require('../controllers/assistant.controller');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin'));

router.get('/businesses', validate(v.adminBusinessList, 'query'), c.listBusinesses);
router.patch('/businesses/:id', validate(v.idParam, 'params'), validate(v.adminBusinessUpdate), c.updateBusiness);
router.get('/businesses/:id', validate(v.idParam, 'params'), extra.getBusiness);
router.get('/stats', c.stats);
router.get('/payments', validate(v.adminPaymentList, 'query'), extra.listPayments);
router.get('/payments/export', validate(v.adminPaymentList, 'query'), extra.exportPayments);
router.get('/support', validate(v.supportList, 'query'), extra.listSupport);
router.patch('/support/:id', validate(v.idParam, 'params'), validate(v.supportUpdate), extra.updateSupport);

router.get('/knowledge', assistant.listKnowledge);
router.post('/knowledge', validate(v.knowledgeCreate), assistant.createKnowledge);
router.patch('/knowledge/:id', validate(v.idParam, 'params'), validate(v.knowledgeUpdate), assistant.updateKnowledge);
router.delete('/knowledge/:id', validate(v.idParam, 'params'), assistant.deleteKnowledge);
router.get('/assistant/gaps', assistant.listGaps);
router.patch('/assistant/gaps/:id', validate(v.idParam, 'params'), validate(v.gapResolve), assistant.resolveGap);
router.get('/assistant/usage', assistant.usage);

module.exports = router;
