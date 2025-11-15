import { existsSync, readdirSync } from 'node:fs'
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

function chromiumExecutableFromDir(dirPath) {
  const chromePath = join(dirPath, 'chrome-linux', 'chrome')
  if (existsSync(chromePath)) return chromePath

  const headlessShell = join(dirPath, 'chrome-linux', 'headless_shell')
  if (existsSync(headlessShell)) return headlessShell

  return null
}

function findInstalledChromium(browsersPath) {
  if (!existsSync(browsersPath)) return null

  const entries = readdirSync(browsersPath, { withFileTypes: true })
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue
    if (!dirent.name.startsWith('chromium')) continue

    const executablePath = chromiumExecutableFromDir(join(browsersPath, dirent.name))
    if (executablePath) return executablePath
  }

  return null
}

function candidateBrowsersPaths() {
  const projectRoot = join(__dirname, '..')
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  const paths = []

  if (envPath && envPath !== '0') {
    paths.push(envPath)
  }

  paths.push(join(projectRoot, 'node_modules', 'playwright', '.local-browsers'))
  paths.push(join(projectRoot, 'node_modules', 'playwright-core', '.local-browsers'))

  return paths
}

function tryChromiumWithBrowsersPath(browsersPath) {
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  const execPath = chromiumExecutablePath()
  if (hasChromium(execPath)) {
    console.log(`${LOG_PREFIX} Found Chromium via PLAYWRIGHT_BROWSERS_PATH=${browsersPath}`)
    return execPath
  }

  if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH
  else process.env.PLAYWRIGHT_BROWSERS_PATH = previous

  return null
}

function findLocalChromium() {
  const existingPath = chromiumExecutablePath()
  if (hasChromium(existingPath)) return existingPath

  for (const browsersPath of candidateBrowsersPaths()) {
    if (!existsSync(browsersPath)) continue

    const manualExecutable = findInstalledChromium(browsersPath)
    if (manualExecutable) {
      process.env.PLAYWRIGHT_BROWSERS_PATH ||= browsersPath
      console.log(`${LOG_PREFIX} Found Chromium via local cache at ${manualExecutable}`)
      return manualExecutable
    }

    const execPath = tryChromiumWithBrowsersPath(browsersPath)
    if (execPath) return execPath
  }

  return null
}

function resolveCliPath() {
  try {
    const pkgJsonPath = require.resolve('playwright/package.json')
    const pkgDir = dirname(pkgJsonPath)
    const cliPath = join(pkgDir, 'cli.js')
    if (!existsSync(cliPath)) {
      throw new Error('playwright_cli_missing')
    }
    return cliPath
  } catch (error) {
    console.error(`${LOG_PREFIX} Unable to resolve playwright CLI`, error)
    throw error
  }
}

async function runPlaywrightInstall(browsersPath) {
  const cliPath = resolveCliPath()
  const env = { ...process.env }

  // Favor a deterministic install path to avoid Playwright writing into an alternate package root
  if (!env.PLAYWRIGHT_BROWSERS_PATH && browsersPath) {
    env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  }
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
  const existingPath = findLocalChromium()
  if (existingPath) return existingPath

  const preferredBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
    || join(__dirname, '..', 'node_modules', 'playwright', '.local-browsers')

  await runPlaywrightInstall(preferredBrowsersPath)

  const installedPath = findLocalChromium()
  if (!installedPath) {
    throw new Error('playwright_chromium_missing_after_install')
  }
  console.log(`${LOG_PREFIX} Playwright Chromium ready at ${installedPath}`)
  return installedPath
}

let pending = null

export async function ensurePlaywrightChromium() {
  const existingPath = findLocalChromium()
  if (existingPath) {
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

