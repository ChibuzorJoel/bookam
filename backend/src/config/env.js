require('dotenv').config();
const { z } = require('zod');

const bool = (def) =>
  z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_MAX_AGE_DAYS: z.coerce.number().default(7),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),

  PLATFORM_NAME: z.string().default('YourPlatform'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4200'),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  PLACEHOLDER_EMAIL_DOMAIN: z.string().default('customers.yourplatform.com'),

  USE_TRANSACTIONS: bool('true'),
  ENABLE_JOBS: bool('true'),
  ENFORCE_PLAN_LIMITS: bool('true'),
  REQUIRE_ADMIN_APPROVAL: bool('false'),
  NOTIFY_SMS: bool('false'),
  BOOKING_HOLD_MINUTES: z.coerce.number().default(10),
  MAX_ADVANCE_BOOKING_DAYS: z.coerce.number().default(60),

  PAYMENT_PROVIDER: z.enum(['paystack', 'payaza']).default('paystack'),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYAZA_PUBLIC_KEY: z.string().default(''),
  PAYAZA_SECRET_KEY: z.string().default(''), // verifies webhook signatures
  PAYAZA_MODE: z.enum(['Live', 'Test']).default('Test'),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(30).default(0),

  SMS_PROVIDER: z.enum(['console', 'termii']).default('console'),
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER_ID: z.string().default('YourPlatform'),
  TERMII_CHANNEL: z.string().default('dnd'),

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('YourPlatform <noreply@yourplatform.com>'),

  WHATSAPP_CLOUD_ENABLED: bool('false'),
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),

  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),

  ADMIN_PHONE: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  parsed.error.issues.forEach((i) => console.error(` - ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === 'production';
env.corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

module.exports = env;
