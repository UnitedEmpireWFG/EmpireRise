import { ensurePlaywrightChromium } from '../lib/ensure_playwright.js'

ensurePlaywrightChromium()
  .then((path) => {
    if (path) {
      console.log(`[ensure-playwright] Chromium available at ${path}`)
    }
  })
  .catch((error) => {
    console.error('[ensure-playwright] Failed to ensure Playwright Chromium', error)
    process.exitCode = 1
  })
