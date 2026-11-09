const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../utils/logger');

const notFound = (req, res, next) => next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = new AppError(details[0]?.message || 'Validation failed', 400, 'VALIDATION_ERROR', details);
  } else if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}`, 400, 'INVALID_ID');
  } else if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    error = new AppError(`That ${field} is already in use.`, 409, 'DUPLICATE');
  } else if (err.name === 'MulterError') {
    error = new AppError(err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5MB).' : err.message, 400, 'UPLOAD_ERROR');
  } else if (err.type === 'entity.parse.failed') {
    error = new AppError('Invalid JSON body.', 400, 'BAD_JSON');
  } else if (err.type === 'entity.too.large') {
    error = new AppError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
  }

  const status = error.statusCode || 500;
  if (status >= 500) logger.error(req.method, req.originalUrl, err);

  res.status(status).json({
    status: 'error',
    code: error.isOperational ? error.code : 'INTERNAL_ERROR',
    message: error.isOperational ? error.message : 'Something went wrong on our side. Please try again.',
    ...(error.details ? { details: error.details } : {}),
    ...(!env.isProd && !error.isOperational ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };
