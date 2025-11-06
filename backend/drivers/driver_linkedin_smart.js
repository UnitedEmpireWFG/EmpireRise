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

// A tiny deterministic sample so smoke tests can exercise the pipeline end-to-end.
const SAMPLE_PROSPECTS = [
  {
    li_profile_id: 'andrea-sample-ca',
    full_name: 'Andrea Sample',
    headline: 'Financial Wellness Coach at Maple Leaf Advisors',
    company: 'Maple Leaf Advisors',
    location: 'Toronto, Ontario, Canada',
    url: 'https://www.linkedin.com/in/andrea-sample-ca',
    meta: { source: 'sample' }
  },
  {
    li_profile_id: 'devon-growth-ca',
    full_name: 'Devon Growth',
    headline: 'Director of Business Development · Northern Wealth',
    company: 'Northern Wealth',
    location: 'Calgary, Alberta, Canada',
    url: 'https://www.linkedin.com/in/devon-growth-ca',
    meta: { source: 'sample' }
  },
  {
    li_profile_id: 'melanie-retire-ca',
    full_name: 'Melanie Retire',
    headline: 'Retirement Income Specialist',
    company: 'True North Planning',
    location: 'Vancouver, British Columbia, Canada',
    url: 'https://www.linkedin.com/in/melanie-retire-ca',
    meta: { source: 'sample' }
  }
]

function takeSample(limit = 25) {
  return SAMPLE_PROSPECTS.slice(0, Math.min(limit, SAMPLE_PROSPECTS.length))
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
  // For now, emit a deterministic sample so downstream jobs can run.
  return takeSample(limit)
}

/**
 * Optional: pull recent 1st-degree *connections* (distinct from generic prospects).
 * If you don’t need both, keep fetchProspects only.
 */
export async function fetchConnections({ userId, limit = 50 }) {
  const cookies = await readCookies(userId)
  if (!cookies) return []
  // TODO: implement real “my network” or search scrape.
  return takeSample(limit)
}

export class LinkedInSmart {
  async suggestedPeopleCanada(limit = 20) {
    return takeSample(limit).map(p => ({
      handle: p.li_profile_id,
      name: p.full_name,
      headline: p.headline,
      location: p.location,
      open_to_work: false
    }))
  }

  async close() {
    return undefined
  }
}
