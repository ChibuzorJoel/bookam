const { Business } = require('../models');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { RESERVED_SLUGS, slugify, randomSuffix } = require('../utils/slug');

const isSlugFree = async (slug, exceptBusinessId) => {
  if (RESERVED_SLUGS.has(slug)) return false;
  const q = { slug };
  if (exceptBusinessId) q._id = { $ne: exceptBusinessId };
  return !(await Business.exists(q));
};

async function generateUniqueSlug(name) {
  let base = slugify(name);
  if (base.length < 3) base = `shop-${randomSuffix()}`;
  if (await isSlugFree(base)) return base;
  for (let i = 0; i < 8; i++) {
    const candidate = `${base.slice(0, 35)}-${randomSuffix()}`;
    if (await isSlugFree(candidate)) return candidate;
  }
  throw new AppError('Could not generate a page address. Please try a different business name.', 409, 'SLUG_UNAVAILABLE');
}

async function createBusinessForOwner(user, { businessName, mode, slug }) {
  const wanted = slug && (await isSlugFree(slug)) ? slug : await generateUniqueSlug(businessName);
  return Business.create({
    ownerId: user._id,
    name: businessName,
    slug: wanted,
    mode,
    whatsappNumber: user.phone, // sensible default: the sign-up number; the owner can change it
    hours: Business.defaultHours(),
    status: env.REQUIRE_ADMIN_APPROVAL ? 'pending' : 'active',
  });
}

const publicUrl = (business) => `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/${business.slug}`;

module.exports = { isSlugFree, generateUniqueSlug, createBusinessForOwner, publicUrl };
