import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, 'dist', 'admin'), { recursive: true });
await cp(path.join(root, 'admin'), path.join(root, 'dist', 'admin'), { recursive: true, force: true });
console.log('Admin assets copied to dist/admin');
