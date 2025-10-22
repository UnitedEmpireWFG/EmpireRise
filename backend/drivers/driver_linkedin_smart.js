// Safe placeholder driver. It proves the plumbing works and never crashes.
// Later, replace the three TODOs with real scraping/API logic.

import fs from 'node:fs/promises'
import path from 'node:path'

const COOKIES_DIR = process.env.LI_COOKIES_DIR || '/opt/render/project/.data/li_cookies'

async function readCookies(userId) {
  const p = path.join(COOKIES_DIR, `${userId}.json`)
  try {
    const raw = await fs.readFile(p, 'utf8')
    const cookies = JSON.parse(raw)
    if (!Array.isArray(cookies) || cookies.length === 0) throw new Error('no_cookies')
    return cookies
  } catch {
    return null
  }
}

/**
 * Fetch a *small* batch of prospects.
 * Return array of { li_profile_id, full_name, headline, company, location, url, meta }
 */
export async function fetchProspects({ userId, limit = 25 }) {
  const cookies = await readCookies(userId)
  if (!cookies) {
    console.log('li_driver: no cookies for', userId)
    return []
  }

  // TODO: replace with real logic using cookies to pull 1st-degree contacts or searches.
  // For now, return an empty array (safe), or generate a tiny synthetic sample if you want smoke tests.
  return []
}

/**
 * Optional: pull recent 1st-degree *connections* (distinct from generic prospects).
 * If you don’t need both, keep fetchProspects only.
 */
export async function fetchConnections({ userId, limit = 50 }) {
  const cookies = await readCookies(userId)
  if (!cookies) return []
  // TODO: implement real “my network” or search scrape.
  return []
}
