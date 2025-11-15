import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '..');
const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);
const SKIP_FILES = new Set([
  resolve(backendRoot, 'services/calendly.js'),
  resolve(backendRoot, 'services/offers.js')
]);
const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
let hasFailure = false;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(resolve(dir, entry.name));
    } else if (VALID_EXTENSIONS.has(extname(entry.name))) {
      const filePath = resolve(dir, entry.name);
      if (SKIP_FILES.has(filePath)) continue;
      yield filePath;
    }
  }
}

async function checkFile(file) {
  await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ['--check', file], {
      stdio: 'inherit'
    });
    child.on('close', (code) => {
      if (code !== 0) {
        hasFailure = true;
      }
      resolvePromise();
    });
  });
}

(async () => {
  for await (const file of walk(backendRoot)) {
    await checkFile(file);
  }

  if (hasFailure) {
    process.exitCode = 1;
  } else {
    console.log('Syntax check passed for backend JavaScript files.');
  }
})();
