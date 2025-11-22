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

function resolveCliPath() {
  try {
    const pkgJsonPath = require.resolve('playwright/package.json')
    const pkgDir = dirname(pkgJsonPath)
    const cliPath = join(pkgDir, 'cli.js')
    if (!cliPath) {
      throw new Error('playwright_cli_missing')
    }
    return cliPath
  } catch (error) {
    console.error(`${LOG_PREFIX} Unable to resolve playwright CLI`, error)
    throw error
  }
}

async function runPlaywrightInstall() {
  const cliPath = resolveCliPath()
  const installDir = join(__dirname, '..', 'node_modules', 'playwright', '.local-browsers')
  console.log(`${LOG_PREFIX} Installing default Playwright Chromium into ${installDir} ...`)

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'install', 'chromium'], {
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`playwright install exited with code ${code}`))
    })
  })
}

export async function ensurePlaywrightChromium() {
  const existingPath = chromiumExecutablePath()
  if (existingPath) return existingPath

  await runPlaywrightInstall()

  const installedPath = chromiumExecutablePath()
  if (!installedPath) {
    throw new Error('playwright_chromium_missing_after_install')
  }
  console.log(`${LOG_PREFIX} Playwright Chromium ready at ${installedPath}`)
  return installedPath
}
