// Everything under /me is owner-only and automatically scoped to the signed-in owner's business.
const router = require('express').Router();
const v = require('../validators');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { protect, restrictTo, loadBusiness } = require('../middleware/auth');
const { requireFeature } = require('../middleware/planGuard');

const business = require('../controllers/business.controller');
const catalog = require('../controllers/catalog.controller');
const availability = require('../controllers/availability.controller');
const bookings = require('../controllers/booking.controller');
const orders = require('../controllers/order.controller');
const dashboard = require('../controllers/dashboard.controller');
const payout = require('../controllers/payout.controller');

router.use(protect, restrictTo('owner'), loadBusiness);

// Business profile
router.get('/business', business.getMyBusiness);
router.patch('/business', validate(v.businessUpdate), business.updateMyBusiness);
router.post('/business/logo', upload.single('logo'), business.uploadLogo);

// Catalog: products (multipart so photos can be sent with the form)
router.get('/products', catalog.listProducts);
router.post('/products', upload.array('images', 6), validate(v.productCreate), catalog.createProduct);
router.patch('/products/:id', validate(v.idParam, 'params'), upload.array('images', 6), validate(v.productUpdate), catalog.updateProduct);
router.delete('/products/:id', validate(v.idParam, 'params'), catalog.deleteProduct);

// Catalog: services (bookings need the Starter plan or higher)
router.get('/services', catalog.listServices);
router.post('/services', requireFeature('booking', 'Booking services are available on the Starter plan and above.'), validate(v.serviceCreate), catalog.createService);
router.patch('/services/:id', validate(v.idParam, 'params'), validate(v.serviceUpdate), catalog.updateService);
router.delete('/services/:id', validate(v.idParam, 'params'), catalog.deleteService);

// Availability
router.get('/hours', availability.getHours);
router.put('/hours', validate(v.hoursUpdate), availability.putHours);
router.post('/exceptions', validate(v.exceptionCreate), availability.addException);
router.delete('/exceptions/:id', validate(v.idParam, 'params'), availability.removeException);

// Bookings & orders
router.get('/bookings', validate(v.bookingListQuery, 'query'), bookings.listBookings);
router.get('/bookings/:id', validate(v.idParam, 'params'), bookings.getBooking);
router.patch('/bookings/:id', validate(v.idParam, 'params'), validate(v.bookingAction), bookings.updateBooking);
router.get('/orders', validate(v.orderListQuery, 'query'), orders.listOrders);
router.patch('/orders/:id', validate(v.idParam, 'params'), validate(v.orderUpdate), orders.updateOrder);

// Payouts (bank account -> Paystack subaccount) and deposit history
router.get('/payments/banks', payout.listBanks);
router.put('/payments/bank', validate(v.bankSetup), payout.setupBank);
router.get('/payments', validate(v.pagingQuery, 'query'), payout.listPayments);

// Dashboard, analytics, share
router.get('/dashboard', dashboard.summary);
router.get('/analytics', dashboard.analytics);
router.get('/share', dashboard.share);
router.get('/share/qr.png', dashboard.qrPng);

module.exports = router;
