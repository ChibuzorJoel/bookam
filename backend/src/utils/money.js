// All money is stored as integer kobo.
const toNaira = (kobo) => kobo / 100;
const formatNaira = (kobo) =>
  `₦${toNaira(kobo || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

module.exports = { toNaira, formatNaira };
