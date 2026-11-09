const AppError = require('../utils/AppError');

/** validate(schema, 'body' | 'query' | 'params') - replaces req[source] with the parsed (and stripped) value. */
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] || {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new AppError(details[0]?.message || 'Validation failed', 400, 'VALIDATION_ERROR', details));
  }
  req[source] = result.data;
  next();
};
