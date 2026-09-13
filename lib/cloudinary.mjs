/* Cloudinary client configured from environment variables. */
import { v2 as cloudinary } from 'cloudinary';

const REQUIRED = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
let configured = false;

export const isCloudinaryConfigured = () => REQUIRED.every(name => Boolean(process.env[name]));

// The Cloudinary account already holds media from other work, so everything
// this site uploads lives under a single folder.
export const cloudinaryFolder = () => process.env.CLOUDINARY_FOLDER || 'athenaheatex';

export function getCloudinary() {
  if (!configured) {
    const missing = REQUIRED.filter(name => !process.env[name]);
    if (missing.length) throw new Error('Missing Cloudinary configuration: ' + missing.join(', '));
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}
