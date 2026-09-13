/* npm run check:services — confirm MongoDB and Cloudinary accept the configured
   credentials. Prints status only, never the credentials themselves. */
import { closeDatabase, databaseName, getClient, isDatabaseConfigured } from '../lib/mongodb.mjs';
import { cloudinaryFolder, getCloudinary, isCloudinaryConfigured } from '../lib/cloudinary.mjs';

let failed = false;

if (isDatabaseConfigured()) {
  try {
    const client = await getClient();
    await client.db('admin').command({ ping: 1 });
    const collections = await client.db(databaseName()).listCollections({}, { nameOnly: true }).toArray();
    console.log(`MongoDB     ok    database=${databaseName()} collections=${collections.map(c => c.name).join(',') || '(none yet)'}`);
  } catch (error) {
    failed = true;
    console.log(`MongoDB     FAIL  ${error.name}: ${error.message}`);
  } finally {
    await closeDatabase();
  }
} else {
  console.log('MongoDB     not configured (set MONGODB_URI)');
}

if (isCloudinaryConfigured()) {
  try {
    const result = await getCloudinary().api.ping();
    console.log(`Cloudinary  ok    cloud=${process.env.CLOUDINARY_CLOUD_NAME} folder=${cloudinaryFolder()} status=${result.status}`);
  } catch (error) {
    failed = true;
    console.log(`Cloudinary  FAIL  ${error?.error?.message || error.message}`);
  }
} else {
  console.log('Cloudinary  not configured (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
}

process.exit(failed ? 1 : 0);
