const { Business, Service, Product } = require('../models');
const { seedFor } = require('../data/industryTemplates');
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

async function createBusinessForOwner(user, { businessName, mode, slug, industry }) {
  const wanted = slug && (await isSlugFree(slug)) ? slug : await generateUniqueSlug(businessName);
  const biz = await Business.create({
    ownerId: user._id,
    name: businessName,
    slug: wanted,
    mode,
    whatsappNumber: user.phone, // sensible default: the sign-up number; the owner can change it
    hours: Business.defaultHours(),
    status: env.REQUIRE_ADMIN_APPROVAL ? 'pending' : 'active',
  });
  if (industry) await seedIndustry(biz, industry);
  return biz;
}

/** Adds the industry's starter tagline and hidden example items. Never blocks sign-up if it fails. */
async function seedIndustry(biz, industry) {
  try {
    const { services, products, tagline } = seedFor(industry, biz._id, biz.mode);
    if (tagline && !biz.tagline) await Business.updateOne({ _id: biz._id }, { $set: { tagline } });
    if (services.length) await Service.insertMany(services);
    if (products.length) await Product.insertMany(products);
  } catch (err) {
    console.error('industry seed failed', err.message);
  }
}

const publicUrl = (business) => `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/${business.slug}`;

module.exports = { isSlugFree, generateUniqueSlug, createBusinessForOwner, publicUrl };
