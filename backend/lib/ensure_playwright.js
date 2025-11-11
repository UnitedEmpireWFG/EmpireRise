import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_PREFIX = '[ensure-playwright]'

function chromiumExecutablePath() {
  try {
    return chromium.executablePath()
  } catch (error) {
    console.warn(`${LOG_PREFIX} chromium.executablePath() failed`, error?.message || error)
    return null
  }
}

function hasChromium(path) {
  return !!(path && existsSync(path))
}

function resolveCliPath() {
  try {
    return require.resolve('playwright/cli.js')
  } catch (error) {
    console.error(`${LOG_PREFIX} Unable to resolve playwright CLI`, error)
    throw error
  }
}

async function runPlaywrightInstall() {
  const cliPath = resolveCliPath()
  const env = { ...process.env }
  if (!env.PLAYWRIGHT_BROWSERS_PATH) {
    // Install into node_modules/playwright/.local-browsers so deployments cache it
    env.PLAYWRIGHT_BROWSERS_PATH = '0'
  }

  const installDir = env.PLAYWRIGHT_BROWSERS_PATH === '0'
    ? join(__dirname, '..', 'node_modules', 'playwright', '.local-browsers')
    : env.PLAYWRIGHT_BROWSERS_PATH

  console.log(`${LOG_PREFIX} Playwright Chromium missing. Installing into ${installDir} ...`)

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'install', 'chromium'], {
      stdio: 'inherit',
      env,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`playwright install exited with code ${code}`))
    })
  })
}

async function installIfMissing() {
  const existingPath = chromiumExecutablePath()
  if (hasChromium(existingPath)) return existingPath

  await runPlaywrightInstall()

  const installedPath = chromiumExecutablePath()
  if (!hasChromium(installedPath)) {
    throw new Error('playwright_chromium_missing_after_install')
  }
  console.log(`${LOG_PREFIX} Playwright Chromium ready at ${installedPath}`)
  return installedPath
}

let pending = null

export async function ensurePlaywrightChromium() {
  const existingPath = chromiumExecutablePath()
  if (hasChromium(existingPath)) {
    return existingPath
  }
  if (!pending) {
    pending = installIfMissing().catch((error) => {
      pending = null
      throw error
    })
  }
  return pending
}

