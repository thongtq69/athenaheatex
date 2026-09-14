import { ensureCmsSeeded } from '../lib/cms.mjs';
import { closeDatabase } from '../lib/mongodb.mjs';

try {
  const result = await ensureCmsSeeded({ force: process.argv.includes('--force') });
  console.log('CMS seed:', JSON.stringify(result));
} finally {
  await closeDatabase();
}
