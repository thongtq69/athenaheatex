/* Service status without exposing any configuration value. Cloudinary is only
   reported as configured: pinging its Admin API from a public endpoint would
   let anyone burn through the account's hourly rate limit. */
import { isDatabaseConfigured, pingDatabase } from './mongodb.mjs';
import { isCloudinaryConfigured } from './cloudinary.mjs';

export async function healthReport() {
  const report = {
    ok: true,
    database: 'not-configured',
    media: isCloudinaryConfigured() ? 'configured' : 'not-configured',
  };
  if (isDatabaseConfigured()) {
    try {
      await pingDatabase();
      report.database = 'up';
    } catch {
      report.database = 'down';
      report.ok = false;
    }
  }
  return report;
}
