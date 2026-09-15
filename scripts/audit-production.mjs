import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { PUBLIC_PATHS } from '../lib/public-path-map.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = String(process.env.SITE_BASE_URL || 'https://athenaheatex.vercel.app').replace(/\/+$/, '');
const routes = [...new Set(['/', ...Object.values(PUBLIC_PATHS), '/404.html'])];
const issues = {
  failedPages: [], nonCmsPages: [], missingLang: [], missingHeadings: [], missingBaseStyles: [], missingAlts: [],
  duplicateIds: [], invalidForms: [], unnamedFields: [], legacyLinks: [], brokenAssets: [],
};
const assets = new Set();

async function parallel(items, concurrency, handler) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await handler(items[index], index);
    }
  }));
}

await parallel(routes, 8, async route => {
  let response;
  try {
    response = await fetch(new URL(route, base), { redirect: 'follow', headers: { 'User-Agent': 'AthenaHeatEx production audit' } });
  } catch (error) {
    issues.failedPages.push({ route, error: error.message });
    return;
  }
  if (!response.ok) {
    issues.failedPages.push({ route, status: response.status });
    return;
  }
  const html = await response.text();
  const $ = load(html);
  if (!$('meta[name="cms-rendered"]').length && route !== '/404.html') issues.nonCmsPages.push(route);
  if ($('html').attr('lang') !== 'vi') issues.missingLang.push(route);
  if (!$('h1').length) issues.missingHeadings.push(route);
  if ($('.mo-header,#header,#nav,#footer').length && !$('link[rel="stylesheet"][href="/templates/default/css/public.css"]').length) {
    issues.missingBaseStyles.push(route);
  }
  $('img').each((_, node) => {
    const src = String($(node).attr('src') || '').trim();
    if (src) assets.add(new URL(src, response.url).href);
    if (!String($(node).attr('alt') || '').trim()) issues.missingAlts.push({ route, src });
  });
  $('script[src],link[rel="stylesheet"][href]').each((_, node) => {
    const url = $(node).attr('src') || $(node).attr('href');
    if (url) assets.add(new URL(url, response.url).href);
  });
  const ids = new Set();
  $('[id]').each((_, node) => {
    const id = $(node).attr('id');
    if (ids.has(id)) issues.duplicateIds.push({ route, id });
    ids.add(id);
  });
  $('.crm-form form').each((_, node) => {
    if ($(node).attr('action') !== '/api/inquiries' || String($(node).attr('method') || '').toLowerCase() !== 'post') issues.invalidForms.push(route);
  });
  $('input:not([type="hidden"]),textarea,select').each((_, node) => {
    const field = $(node);
    const labelled = field.attr('aria-label') || field.attr('aria-labelledby') || field.attr('id') && $(`label[for="${field.attr('id')}"]`).length;
    if (!labelled) issues.unnamedFields.push({ route, name: field.attr('name') || '' });
  });
  $('a[href^="/"]').each((_, node) => {
    const href = String($(node).attr('href') || '').split(/[?#]/)[0];
    if (href.endsWith('.html') && href !== '/404.html') issues.legacyLinks.push({ route, href });
  });
});

await parallel([...assets], 12, async url => {
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { Range: 'bytes=0-0', 'User-Agent': 'AthenaHeatEx production audit' } });
    if (!response.ok) issues.brokenAssets.push({ url, status: response.status });
    await response.body?.cancel();
  } catch (error) {
    issues.brokenAssets.push({ url, error: error.message });
  }
});

const counts = Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.length]));
const report = {
  generatedAt: new Date().toISOString(), base, pagesChecked: routes.length, assetsChecked: assets.size,
  counts, samples: Object.fromEntries(Object.entries(issues).map(([name, values]) => [name, values.slice(0, 20)])),
};
if (!process.argv.includes('--no-write')) {
  await writeFile(path.join(root, 'reports', 'production-audit.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (Object.values(counts).some(Boolean)) process.exitCode = 1;
