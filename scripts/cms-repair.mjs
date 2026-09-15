import { repairMissingCmsContent } from '../lib/cms.mjs';
import { closeDatabase } from '../lib/mongodb.mjs';

try {
  const result = await repairMissingCmsContent();
  console.log('CMS repair:', JSON.stringify(result, null, 2));
} finally {
  await closeDatabase();
}
