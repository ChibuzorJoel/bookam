const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 }, // the client compresses first; 5MB is a safety net
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new AppError('Only JPG, PNG or WebP images are allowed.', 400, 'INVALID_FILE'));
    cb(null, true);
  },
});

module.exports = upload;
