import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const baseDir = process.env.LI_COOKIE_DIR
  || path.join(moduleDir, '..', '.data', 'li_cookies')

export function getCookieDir() {
  return baseDir
}

export function getCookieFilePath(userId) {
  return path.join(baseDir, `${userId}.json`)
}

export async function ensureCookieDirExists() {
  await fs.promises.mkdir(baseDir, { recursive: true })
}
