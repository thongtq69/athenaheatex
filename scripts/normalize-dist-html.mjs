import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { normalizeDocumentHtml } from '../lib/html-normalize.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const files = (await readdir(dist)).filter(file => file.toLowerCase().endsWith('.html'));
let changed = 0;
for (const file of files) {
  const target = path.join(dist, file);
  const source = await readFile(target, 'utf8');
  const $ = load(source);
  const fallback = String($('h1,.mainTop,.contTitle,title').first().text() || 'Athena Heat Ex').replace(/\s+/g, ' ').trim();
  const normalized = normalizeDocumentHtml(source, fallback);
  if (normalized !== source) {
    await writeFile(target, normalized, 'utf8');
    changed += 1;
  }
}
console.log(`Normalized HTML in ${changed}/${files.length} public files.`);
