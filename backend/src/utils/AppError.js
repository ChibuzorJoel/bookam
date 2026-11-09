class AppError extends Error {
  /**
   * @param {string} message  human readable message (safe to show to users)
   * @param {number} statusCode HTTP status
   * @param {string} code machine readable code the frontend can switch on
   * @param {any} details optional extra info (e.g. validation issues)
   */
  constructor(message, statusCode = 500, code = 'ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
module.exports = AppError;
