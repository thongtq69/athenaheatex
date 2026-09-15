/* Audit the actual MongoDB-rendered pages, not just the static import files. */
import { load } from 'cheerio';
import { CMS } from '../lib/cms.mjs';
import { renderCmsPage } from '../lib/cms-render.mjs';
import { closeDatabase, getDb } from '../lib/mongodb.mjs';
import { PUBLIC_PATHS } from '../lib/public-path-map.mjs';
import { sourcePathForPublicPath } from '../lib/public-paths.mjs';

const issues = {
  missingPages: [], missingBaseStyles: [], duplicateIds: [], missingAlts: [], forms: [], brokenLinks: [], legacyPublicLinks: [],
  missingMediaRecords: [], disabledMediaInUse: [], missingEntityPages: [], mismatchedEntityPages: [], orphanEntityPages: [],
};
try {
  const db = await getDb();
  const pages = await db.collection(CMS.pages).find({ enabled: true }, { projection: { path: 1, sourceEntityId: 1 } }).toArray();
  const paths = new Set(pages.map(page => page.path));
  const referencedImages = new Set();

  for (let start = 0; start < pages.length; start += 4) {
    await Promise.all(pages.slice(start, start + 4).map(async page => {
      const html = await renderCmsPage(page.path);
      if (!html) { issues.missingPages.push(page.path); return; }
      const $ = load(html);
      if ($('.mo-header,#header,#nav,#footer').length && !$('link[rel="stylesheet"][href="/templates/default/css/public.css"]').length) {
        issues.missingBaseStyles.push(page.path);
      }
      const ids = new Set();
      $('[id]').each((_, node) => {
        const id = $(node).attr('id');
        if (ids.has(id)) issues.duplicateIds.push({ page: page.path, id });
        ids.add(id);
      });
      $('img').each((_, node) => {
        const src = String($(node).attr('src') || '').trim();
        if (src) referencedImages.add(src);
        if (!String($(node).attr('alt') || '').trim()) issues.missingAlts.push(page.path);
      });
      $('.crm-form form').each((_, node) => {
        if ($(node).attr('action') !== '/api/inquiries' || $(node).attr('method') !== 'post') issues.forms.push(page.path);
      });
      $('a[href^="/"]').each((_, node) => {
        const target = String($(node).attr('href') || '').split(/[?#]/)[0];
        if (PUBLIC_PATHS[target]) issues.legacyPublicLinks.push({ page: page.path, target });
        const source = sourcePathForPublicPath(target);
        if ((source.endsWith('.html') || PUBLIC_PATHS[source]) && !paths.has(source)) issues.brokenLinks.push({ page: page.path, target });
      });
    }));
  }

  const media = await db.collection(CMS.media).find({}, { projection: { url: 1, enabled: 1 } }).toArray();
  const mediaByUrl = new Map(media.map(item => [item.url, item]));
  for (const src of referencedImages) {
    if (!mediaByUrl.has(src)) issues.missingMediaRecords.push(src);
    else if (!mediaByUrl.get(src).enabled) issues.disabledMediaInUse.push(src);
  }

  const entityIds = new Set();
  for (const [kind, collection] of [['product', CMS.products], ['service', CMS.services], ['category', CMS.categories]]) {
    const entities = await db.collection(collection).find({ enabled: true }, { projection: { path: 1 } }).toArray();
    for (const entity of entities) {
      const id = String(entity._id);
      entityIds.add(id);
      const page = pages.find(item => item.path === entity.path);
      if (!page) issues.missingEntityPages.push({ kind, id, path: entity.path });
      else if (String(page.sourceEntityId || '') !== id) issues.mismatchedEntityPages.push({ kind, id, path: entity.path, pageEntityId: String(page.sourceEntityId || '') });
    }
  }
  for (const page of pages) {
    if (page.sourceEntityId && !entityIds.has(String(page.sourceEntityId))) {
      issues.orphanEntityPages.push({ path: page.path, sourceEntityId: String(page.sourceEntityId) });
    }
  }

  const counts = Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.length]));
  console.log(JSON.stringify({ pagesChecked: pages.length, referencedImages: referencedImages.size, mediaRecords: media.length, counts, samples: Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.slice(0, 5)])) }, null, 2));
  if (Object.values(counts).some(Boolean)) process.exitCode = 1;
} finally {
  await closeDatabase();
}
