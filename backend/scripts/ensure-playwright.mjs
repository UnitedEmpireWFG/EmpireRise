import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

function chromiumExecutablePath() {
  try {
    return chromium.executablePath();
  } catch (error) {
    console.warn('[ensure-playwright] chromium.executablePath() failed', error?.message || error);
    return null;
  }
}

function hasChromium(executablePath) {
  return !!(executablePath && existsSync(executablePath));
}

function resolveLocalBrowsersDir() {
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (envPath) {
    return envPath;
  }

  return join(__dirname, '..', 'node_modules', 'playwright', '.local-browsers');
}

function ensureChromiumInstalled() {
  const executablePath = chromiumExecutablePath();
  if (hasChromium(executablePath)) {
    return;
  }

  const browsersDir = resolveLocalBrowsersDir();
  console.log(`[ensure-playwright] Playwright Chromium missing. Installing into ${browsersDir} ...`);
  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('[ensure-playwright] Failed to install Playwright Chromium', error);
    throw error;
  }
}

ensureChromiumInstalled();
