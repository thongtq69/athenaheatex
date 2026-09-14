import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { cmsCounts, ensureCmsSeeded } from '../lib/cms.mjs';
import { closeDatabase, isDatabaseConfigured } from '../lib/mongodb.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const entries = await readdir(dist, { recursive: true });
const inspected = await Promise.all(entries.map(async file => ({ file, isFile: (await stat(path.join(dist, file))).isFile() })));
const files = inspected.filter(entry => entry.isFile).map(entry => entry.file).filter(file => !file.replace(/\\/g, '/').startsWith('admin/'));
const htmlFiles = files.filter(file => file.toLowerCase().endsWith('.html'));
const available = new Set(htmlFiles.map(file => '/' + file.split(path.sep).join('/')));
const findings = { brokenInternalLinks: [], missingImageAlt: [], formsWithoutAction: [], duplicateIds: [] };
let images = 0, forms = 0, bytes = 0, productPages = 0, categoryPages = 0, brokenInternalLinks = 0, missingImageAlt = 0;
const contactValues = new Map();

for (const relative of htmlFiles) {
  const full = path.join(dist, relative);
  const html = await readFile(full, 'utf8');
  bytes += (await stat(full)).size;
  const $ = load(html);
  const pathname = '/' + relative.split(path.sep).join('/');
  if ($('#proDes').length && $('#proimg img').length) productPages += 1;
  if ($('.proDisplay .box').length) categoryPages += 1;
  $('a[href^="/"]').each((_, node) => {
    const href = String($(node).attr('href') || '').split(/[?#]/)[0];
    if (href.endsWith('.html') && !available.has(href)) { brokenInternalLinks += 1; if (findings.brokenInternalLinks.length < 100) findings.brokenInternalLinks.push({ page: pathname, href }); }
  });
  $('img').each((_, node) => { images += 1; if (!String($(node).attr('alt') || '').trim()) { missingImageAlt += 1; if (findings.missingImageAlt.length < 100) findings.missingImageAlt.push({ page: pathname, src: $(node).attr('src') || '' }); } });
  $('form').each((_, node) => { forms += 1; if (!$(node).attr('action')) findings.formsWithoutAction.push(pathname); });
  const ids = new Set();
  $('[id]').each((_, node) => { const id=$(node).attr('id'); if(ids.has(id))findings.duplicateIds.push({page:pathname,id}); ids.add(id); });
  $('a[href^="mailto:"], a[href^="tel:"]').each((_, node) => { const value=$(node).attr('href'); contactValues.set(value,(contactValues.get(value)||0)+1); });
}

let database = null;
if (isDatabaseConfigured()) {
  const seed = await ensureCmsSeeded();
  database = { seed, counts: await cmsCounts() };
}
const report = {
  generatedAt: new Date().toISOString(),
  source: { htmlPages: htmlFiles.length, files: files.length, htmlSizeMB: Number((bytes / 1024 / 1024).toFixed(2)), images, forms, productPages, categoryPages },
  architectureBeforeCms: { staticHtmlContent: true, repeatedHeaderFooterContact: true, publicInquiryBackend: true, adminOrContentApi: false },
  database,
  contactsRepeatedInHtml: [...contactValues.entries()].sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count})),
  findingCounts: { brokenInternalLinks, missingImageAlt, formsWithoutAction: findings.formsWithoutAction.length, duplicateIds: findings.duplicateIds.length },
  findingSamplesLimitedTo: 100,
  findings,
};
await writeFile(path.join(root, 'reports', 'cms-audit.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ report: 'reports/cms-audit.json', source: report.source, database: report.database, findingCounts: report.findingCounts }, null, 2));
await closeDatabase();
