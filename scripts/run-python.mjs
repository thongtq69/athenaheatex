import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const localPython = process.platform === 'win32' ? path.join(root, '.venv', 'Scripts', 'python.exe') : path.join(root, '.venv', 'bin', 'python');
const command = existsSync(localPython) ? localPython : process.platform === 'win32' ? 'py' : 'python3';
const result = spawnSync(command, process.argv.slice(2), { stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`Không chạy được ${command}:`, result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
