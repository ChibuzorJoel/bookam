const { v2: cloudinary } = require('cloudinary');
const env = require('./env');
const AppError = require('../utils/AppError');

const configured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** Upload an in-memory image buffer. Resizes to max 1200px and lets Cloudinary pick WebP/AVIF + quality. */
function uploadBuffer(buffer, folder) {
  if (!configured) {
    throw new AppError('Image uploads are not configured on this server.', 503, 'UPLOADS_DISABLED');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `platform/${folder}`,
        resource_type: 'image',
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, publicId: result.public_id }))
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer, configured };
