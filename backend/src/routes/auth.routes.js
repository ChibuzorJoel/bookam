const router = require('express').Router();
const c = require('../controllers/auth.controller');
const v = require('../validators');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { otpLimiter, loginLimiter, changePasswordLimiter, emailCodeLimiter } = require('../middleware/rateLimit');

router.post('/signup', otpLimiter, validate(v.signup), c.signup);
router.post('/request-otp', otpLimiter, validate(v.requestOtp), c.requestOtp);
router.post('/verify-otp', loginLimiter, validate(v.verifyOtp), c.verifyOtp);
router.post('/login', loginLimiter, validate(v.login), c.login);
router.post('/reset-password', loginLimiter, validate(v.resetPassword), c.resetPassword);
router.post('/change-password', protect, changePasswordLimiter, validate(v.changePassword), c.changePassword);
router.post('/email/request', protect, emailCodeLimiter, validate(v.emailRequest), c.requestEmailCode);
router.post('/email/verify', protect, emailCodeLimiter, validate(v.emailVerify), c.verifyEmail);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);

module.exports = router;
