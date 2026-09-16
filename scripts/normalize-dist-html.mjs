import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { normalizeDocumentHtml } from '../lib/html-normalize.mjs';
import { renderContact, renderGlobalControls } from '../lib/cms-render.mjs';
import { ATHENA_CONTACT_DEFAULTS, rebrandTree, replaceLegacySiteText } from '../lib/site-settings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const files = (await readdir(dist)).filter(file => file.toLowerCase().endsWith('.html'));
let changed = 0;
for (const file of files) {
  const target = path.join(dist, file);
  const source = await readFile(target, 'utf8');
  const $ = load(source);
  const fallback = String($('h1,.mainTop,.contTitle,title').first().text() || 'Athena Heat Ex').replace(/\s+/g, ' ').trim();
  const firstPass = normalizeDocumentHtml(source, fallback);
  const rendered = load(firstPass, { decodeEntities: false });
  renderGlobalControls(rendered, ATHENA_CONTACT_DEFAULTS);
  renderContact(rendered, ATHENA_CONTACT_DEFAULTS);
  rebrandTree(rendered);
  const normalized = rendered.html();
  if (normalized !== source) {
    await writeFile(target, normalized, 'utf8');
    changed += 1;
  }
}
for (const name of ['search-index.json']) {
  const target = path.join(dist, name);
  const source = await readFile(target, 'utf8');
  await writeFile(target, replaceLegacySiteText(source), 'utf8');
}
console.log(`Normalized HTML in ${changed}/${files.length} public files.`);
