/**
 * Starter content for new businesses, picked at sign-up.
 * Prices are in naira here and converted to kobo when seeded. They are only typical examples:
 * everything is created HIDDEN (active: false) so no customer ever sees a price the owner has not checked.
 */
const TEMPLATES = {
  salon: {
    label: 'Hair salon',
    tagline: 'Neat hair, every time. Book your slot online.',
    mode: 'booking',
    services: [
      ['Wash and blow-dry', 60, 5000],
      ['Braids (medium)', 240, 15000],
      ['Wig installation', 90, 10000],
      ['Hair treatment', 60, 8000],
    ],
  },
  barber: {
    label: 'Barber shop',
    tagline: 'Fresh cuts. Skip the queue and book ahead.',
    mode: 'booking',
    services: [
      ['Haircut', 30, 3000],
      ['Haircut and beard trim', 45, 4500],
      ['Kids haircut', 30, 2500],
      ['Hair dye', 60, 6000],
    ],
  },
  makeup: {
    label: 'Makeup artist',
    tagline: 'Makeup that lasts all day. Book your date.',
    mode: 'booking',
    services: [
      ['Soft glam makeup', 60, 20000],
      ['Bridal makeup', 120, 80000],
      ['Gele tying', 30, 8000],
      ['Makeup lesson', 90, 25000],
    ],
  },
  spa: {
    label: 'Spa, nails and lashes',
    tagline: 'Relax and glow. Book your appointment.',
    mode: 'booking',
    services: [
      ['Manicure', 45, 5000],
      ['Pedicure', 60, 7000],
      ['Eyelash extensions', 90, 15000],
      ['Full body massage', 60, 20000],
    ],
  },
  fashion: {
    label: 'Fashion and tailoring',
    tagline: 'Made-to-measure and ready-to-wear.',
    mode: 'both',
    services: [['Fitting and measurement', 30, 0]],
    products: [
      ['Ankara two-piece', 'Ready to wear', 25000],
      ['Native wear (men)', 'Ready to wear', 30000],
      ['Ankara fabric (6 yards)', 'Fabric', 12000],
    ],
  },
  food: {
    label: 'Food and cakes',
    tagline: 'Freshly made. Order on WhatsApp.',
    mode: 'shop',
    products: [
      ['Birthday cake (8 inch)', 'Cakes', 25000],
      ['Small chops platter', 'Platters', 15000],
      ['Meat pie (box of 6)', 'Pastries', 6000],
      ['Zobo (1 litre)', 'Drinks', 2000],
    ],
  },
  gadgets: {
    label: 'Phones and gadgets',
    tagline: 'Genuine gadgets and accessories.',
    mode: 'shop',
    services: [],
    products: [
      ['Phone charger (fast charging)', 'Accessories', 6000],
      ['Wireless earbuds', 'Audio', 15000],
      ['Power bank 20000mAh', 'Accessories', 18000],
      ['Phone case', 'Accessories', 3000],
    ],
  },
  beauty: {
    label: 'Beauty products',
    tagline: 'Skin, hair and body care you can trust.',
    mode: 'shop',
    products: [
      ['Shea butter (500g)', 'Skin care', 4000],
      ['Hair growth oil', 'Hair care', 5000],
      ['Body scrub', 'Skin care', 4500],
      ['Perfume oil', 'Fragrance', 7000],
    ],
  },
  photo: {
    label: 'Photography',
    tagline: 'Moments worth keeping. Book your shoot.',
    mode: 'booking',
    services: [
      ['Portrait session', 60, 30000],
      ['Event coverage (3 hours)', 180, 100000],
      ['Product photography', 90, 40000],
    ],
  },
};

const KEYS = Object.keys(TEMPLATES);

/** Rows ready for Service.insertMany / Product.insertMany (kobo, hidden). */
function seedFor(industry, businessId, mode) {
  const t = TEMPLATES[industry];
  if (!t) return { services: [], products: [], tagline: undefined };
  const wantsBook = mode !== 'shop';
  const wantsShop = mode !== 'booking';
  const services = wantsBook
    ? (t.services || []).map(([name, durationMinutes, naira]) => ({
        businessId, name, durationMinutes, price: naira * 100, depositAmount: 0, active: false,
      }))
    : [];
  const products = wantsShop
    ? (t.products || []).map(([name, category, naira], i) => ({
        businessId, name, category, price: naira * 100, active: false, sortOrder: i,
      }))
    : [];
  return { services, products, tagline: t.tagline };
}

/** Public list for the sign-up screen (no prices). */
const options = () => KEYS.map((key) => ({ key, label: TEMPLATES[key].label, mode: TEMPLATES[key].mode }));

module.exports = { TEMPLATES, KEYS, seedFor, options };
