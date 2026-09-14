import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let removed = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    const relative = path.relative(root, fullPath).replaceAll('\\', '/');
    if (relative.endsWith('.html') && !relative.startsWith('admin/')) {
      await rm(fullPath);
      removed += 1;
    }
  }
}

await walk(root);
console.log(`Removed ${removed} public HTML files so Vercel renders them through the CMS API.`);
