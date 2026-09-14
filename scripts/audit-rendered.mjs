/* Audit the actual MongoDB-rendered pages, not just the static import files. */
import { load } from 'cheerio';
import { CMS } from '../lib/cms.mjs';
import { renderCmsPage } from '../lib/cms-render.mjs';
import { closeDatabase, getDb } from '../lib/mongodb.mjs';

const issues = { missingPages: [], duplicateIds: [], missingAlts: [], forms: [], brokenLinks: [] };
try {
  const db = await getDb();
  const pages = await db.collection(CMS.pages).find({ enabled: true }, { projection: { path: 1 } }).toArray();
  const paths = new Set(pages.map(page => page.path));

  for (let start = 0; start < pages.length; start += 4) {
    await Promise.all(pages.slice(start, start + 4).map(async page => {
      const html = await renderCmsPage(page.path);
      if (!html) { issues.missingPages.push(page.path); return; }
      const $ = load(html);
      const ids = new Set();
      $('[id]').each((_, node) => {
        const id = $(node).attr('id');
        if (ids.has(id)) issues.duplicateIds.push({ page: page.path, id });
        ids.add(id);
      });
      $('img').each((_, node) => {
        if (!String($(node).attr('alt') || '').trim()) issues.missingAlts.push(page.path);
      });
      $('.crm-form form').each((_, node) => {
        if ($(node).attr('action') !== '/api/inquiries' || $(node).attr('method') !== 'post') issues.forms.push(page.path);
      });
      $('a[href^="/"]').each((_, node) => {
        const target = String($(node).attr('href') || '').split(/[?#]/)[0];
        if (target.endsWith('.html') && !paths.has(target)) issues.brokenLinks.push({ page: page.path, target });
      });
    }));
  }

  const counts = Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.length]));
  console.log(JSON.stringify({ pagesChecked: pages.length, counts, samples: Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.slice(0, 5)])) }, null, 2));
  if (Object.values(counts).some(Boolean)) process.exitCode = 1;
} finally {
  await closeDatabase();
}
