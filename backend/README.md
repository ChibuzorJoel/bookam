# Lagos Business Storefront and Booking Platform: Backend API

Node.js + **Express** + **MongoDB (Mongoose)** implementation of section 7 of the product and technical plan.
One platform, two modes: **Shop** (products + WhatsApp orders) and **Booking** (services + Paystack deposits).

## Quick start

```bash
npm install
cp .env.example .env          # fill in MONGODB_URI and JWT_SECRET at minimum
npm run dev                   # http://localhost:5000  (health check: GET /health)
npm run seed:admin            # creates the admin user from ADMIN_* in .env
npm test                      # slot-generation unit tests
```

In development `SMS_PROVIDER=console` and `EMAIL_PROVIDER=console` print OTP codes and emails to the terminal,
so you can sign up without paying for SMS.

> **MongoDB transactions need a replica set.** MongoDB Atlas (free tier) is one. For a plain local `mongod`
> set `USE_TRANSACTIONS=false` (the unique index and day-lock still protect most cases, but use Atlas to test booking concurrency properly).

## Folder structure

```
server.js                    entry point: connect DB, build indexes, start HTTP + jobs, graceful shutdown
src/
  app.js                     Express app: security, raw-body webhook parser, routes, error handling
  config/                    env validation (zod), db, plans & limits, cloudinary
  models/                    User, Otp, Business, Product, Service, Booking, DayLock, Order, Payment, Subscription, Notification
  validators/                zod schemas for every request (mirror these rules in Angular Reactive Forms)
  middleware/                auth (JWT cookie), planGuard, validate, rateLimit, upload (multer), errorHandler
  controllers/               auth, business, catalog, availability, booking, order, public, payment, payout, billing, dashboard, admin
  routes/                    one router per module; routes/index.js mounts them
  services/                  otp, sms (Termii), email (Resend), whatsapp, paystack, notification, booking, payment, business
  templates/messages.js      ALL customer/owner message wording (change text without touching logic)
  jobs/index.js              cron: expire unpaid holds, 24h/2h reminders, subscription expiry + renewal reminders
  utils/                     slots (pure slot generator), time (Lagos), money, phone, slug, ids, tx, pagination
scripts/seedAdmin.js
test/slots.test.js
```

## How the important parts work

| Concern | Implementation |
| --- | --- |
| **Multi-tenancy** | `loadBusiness` middleware resolves the signed-in owner's business; every `/me/*` query filters by `businessId: req.business._id`. Ids from the URL are always combined with that filter. |
| **Auth** | Phone + OTP (sign-up and login) or phone/email + password. JWT in an **HttpOnly** cookie (also returned for `Authorization: Bearer`). OTPs are HMAC-hashed, expire in 10 min, 5 attempts max. `tokenVersion` revokes sessions on password reset. |
| **Slot generation** | `utils/slots.js`: opening hours, minus blocked dates, minus existing bookings (+ buffer), split into steps of duration + buffer. Pure function with unit tests. Lagos time (UTC+1, no DST). |
| **No double booking** | `createBooking` runs in a **transaction**: it touches a per-day lock document, releases expired holds, re-checks the slot, then inserts. The **partial unique index** `uniq_active_slot` on `(businessId, startAt)` where `slotActive: true` is the last line of defence (duplicate start returns `409 SLOT_TAKEN`). |
| **Holds, not TTL** | Deposit bookings start as `pending` with `holdExpiresAt` (10 min). A job marks unpaid ones `cancelled` (reason `hold_expired`); records are never deleted. |
| **Payments** | Paystack **subaccounts**: deposits go straight to the business's bank, platform never holds funds (optional `PLATFORM_FEE_PERCENT`). The booking is `confirmed` **only** by the webhook (HMAC-SHA512 on the raw body) after a server-side `verify` call. Unique `paystackReference` + atomic status claim = idempotent. |
| **Late payments** | If someone pays after the hold lapsed, the booking is re-instated when the slot is still free, otherwise flagged `refund_required` and the owner is notified. |
| **Notifications** | Phase 1: WhatsApp click-to-chat links (`wa.me`, returned in API responses), email (Resend), SMS (Termii). Phase 2: set `WHATSAPP_CLOUD_ENABLED=true` and create the approved templates `platform_<type>`. Notification failures never break a booking. |
| **Plans** | `config/plans.js` + `planGuard`. Free: 10 items, no booking. Starter: booking + deposits. Pro: + custom domain, reminders, analytics. Set `ENFORCE_PLAN_LIMITS=false` during the free pilot. |
| **Security** | helmet, CORS allow-list, rate limits (OTP / login / public writes), `express-mongo-sanitize`, zod validation that strips unknown fields (no mass assignment), bcrypt (12 rounds), secrets only in env. |

## Paystack setup

1. Put your **secret key** in `PAYSTACK_SECRET_KEY` (use `sk_test_...` first).
2. In the Paystack dashboard set the webhook URL to `https://<your-api-host>/payments/webhook/paystack`.
3. Owners connect a bank account through `PUT /me/payments/bank`, which creates their subaccount. Booking deposits require this.
4. Money is in **kobo** everywhere (₦1,500 = `150000`).

## API reference

All responses look like `{ "status": "success", "data": {...} }` or `{ "status": "error", "code": "...", "message": "..." }`.

### Auth
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/signup` | `{ phone, businessName, mode?, email?, password? }` creates user + business, sends OTP |
| POST | `/auth/verify-otp` | `{ phone, otp, purpose: "signup" \| "login" }` starts a session |
| POST | `/auth/request-otp` | `{ phone, purpose: "login" \| "reset" \| "signup" }` |
| POST | `/auth/login` | `{ identifier (phone or email), password }` |
| POST | `/auth/reset-password` | `{ phone, otp, newPassword }` |
| POST | `/auth/logout` | clears the cookie |
| GET | `/auth/me` | current user + business |

### Owner (`/me`, login required)
| Method | Path | Notes |
| --- | --- | --- |
| GET / PATCH | `/me/business` | profile, slug, theme, mode, WhatsApp, custom domain (Pro) |
| POST | `/me/business/logo` | multipart, field `logo` |
| GET / POST | `/me/products` | POST is multipart, field `images` (up to 6) |
| PATCH / DELETE | `/me/products/:id` | PATCH `imageUrls` = images to keep, new uploads appended |
| GET / POST | `/me/services` | `{ name, durationMinutes, price, depositAmount, bufferMinutes }` |
| PATCH / DELETE | `/me/services/:id` | a service with history is archived, not deleted |
| GET / PUT | `/me/hours` | PUT body: `{ hours: [7 x { weekday 0-6, openTime, closeTime, isClosed }] }` |
| POST / DELETE | `/me/exceptions`, `/me/exceptions/:id` | block a date or a time window |
| GET | `/me/bookings?from=&to=&status=&page=&limit=` | includes `customerWhatsappLink` |
| PATCH | `/me/bookings/:id` | `{ action: confirm \| cancel \| complete \| no_show \| reschedule, date?, time? }` |
| GET / PATCH | `/me/orders`, `/me/orders/:id` | |
| GET | `/me/payments/banks` · PUT `/me/payments/bank` · GET `/me/payments` | payout setup and deposit history |
| GET | `/me/dashboard` · `/me/analytics` (Pro) | today's bookings, recent orders, stats |
| GET | `/me/share` · `/me/share/qr.png` | public link, QR code, social text |

### Public (no login)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/public/:slug` | business + products + services in one call |
| GET | `/public/by-domain?host=` | custom-domain lookup |
| GET | `/public/:slug/availability?service_id=&date=YYYY-MM-DD` | open times, e.g. `["09:00","10:00"]` |
| POST | `/public/:slug/bookings` | `{ serviceId, date, time, customerName, customerPhone, customerEmail?, notes? }` returns booking + Paystack `authorizationUrl`/`accessCode` |
| POST | `/public/:slug/orders` | `{ customerName, customerPhone, items: [{ productId, qty }] }` returns order + pre-filled `whatsappLink` (prices re-read on the server) |
| GET | `/public/bookings/:code` | confirmation page / status polling |

### Payments, billing, admin
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/payments/webhook/paystack` | signature verified, idempotent |
| GET | `/payments/verify/:reference` | optional: confirm right after the popup closes |
| GET | `/billing/plans` · POST `/billing/subscribe` · GET `/billing/status` | plan upgrades via Paystack checkout |
| GET | `/admin/businesses` · PATCH `/admin/businesses/:id` · GET `/admin/stats` | admin role only |

## Booking flow in practice (for the Angular BookingWizard)

1. `GET /public/:slug`, show services.
2. `GET /public/:slug/availability?service_id=&date=`, show open times.
3. `POST /public/:slug/bookings`. Open the Paystack popup with the returned `accessCode` (Paystack Inline `resumeTransaction`) or redirect to `authorizationUrl`.
4. Poll `GET /public/bookings/:code` (or call `/payments/verify/:reference`) until `status` is `confirmed`.
   Show the `whatsappLink` on the confirmation screen.

## Deploying (Render / Railway)

- Build: `npm install`. Start: `npm start`. Node 18.17+.
- Set every variable from `.env.example`. Use `NODE_ENV=production`, real Paystack/Termii/Resend/Cloudinary keys.
- Run **one** instance at first (jobs are safe with several, reminders are claimed atomically, but start simple).
- If the Angular app and API are on different sites, set `COOKIE_SAMESITE=none` and list the frontend in `CORS_ORIGINS`; the Angular `HttpClient` must send `withCredentials: true`.
- Enable daily backups on Atlas and add Sentry (`@sentry/node`) in `server.js` when you are ready.

## Known limits (by design for the MVP)

- One provider per business (no staff calendars). To add staff, add `staffId` to the Booking schema and to the key of `uniq_active_slot`.
- Refunds are flagged (`paymentStatus: refund_required`) and the owner is notified; they refund from their Paystack dashboard.
- Removed product images are not deleted from Cloudinary (the logo's old image is).
- Test the full payment path with Paystack **test keys** before going live.
