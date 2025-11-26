import fs from 'node:fs/promises'

import { LinkedInSmart as PlaywrightLinkedInSmart } from '../services/driver_linkedin_smart.js'
import { getLinkedInCookiePath } from '../utils/linkedin_cookies.js'

const NOTE_MAX_LENGTH = 280

async function cookiePathFor(userId) {
  if (!userId) throw new Error('missing_user')
  const perUserPath = getLinkedInCookiePath(userId)
  try {
    await fs.access(perUserPath)
    return perUserPath
  } catch {
    // fall through to shared cookie path
  }

  const sharedPath = process.env.LI_COOKIES_PATH
  if (sharedPath) {
    try {
      await fs.access(sharedPath)
      return sharedPath
    } catch {
      // ignore and throw below
    }
  }

  throw new Error('missing_cookies')
}

async function runWithDriver(userId, run) {
  const cookiesPath = await cookiePathFor(userId)
  const driver = new PlaywrightLinkedInSmart({ cookiesPath, userId })
  try {
    return await run(driver)
  } finally {
    await driver.close().catch(() => {})
  }
}

function normalizeHandle(rawHandle, profileUrl) {
  const direct = String(rawHandle || '').trim()
  if (direct) {
    return direct.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '').replace(/[/?#].*$/, '')
  }
  const fromUrl = String(profileUrl || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')
    .replace(/[/?#].*$/, '')
  return fromUrl || null
}

function profileUrlFor(handle, fallbackUrl) {
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) return fallbackUrl
  if (!handle) return fallbackUrl || null
  return `https://www.linkedin.com/in/${encodeURIComponent(handle)}`
}

async function getProfileLocation(driver, handle) {
  try {
    const location = await driver.profileLocation(handle)
    return location || null
  } catch {
    return null
  }
}

function mapProspect(meta) {
  if (!meta || typeof meta !== 'object') return null
  const handle = meta.handle || meta.public_id || null
  const url = profileUrlFor(handle, meta.profile_url)
  return {
    source: 'linkedin_suggested_people',
    li_profile_id: handle,
    full_name: meta.name || meta.full_name || null,
    headline: meta.headline || null,
    company: meta.company || null,
    location: meta.location || meta.region || null,
    url,
    meta: {
      source: 'linkedin_suggested_people',
      open_to_work: meta.open_to_work === true
    }
  }
}

export async function fetchProspects({ userId, limit = 25 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 200))
  const results = await runWithDriver(userId, async (driver) => {
    return await driver.suggestedPeopleCanada(safeLimit)
  })
  return (Array.isArray(results) ? results : [])
    .map(mapProspect)
    .filter(Boolean)
}

export async function fetchConnections({ userId, limit = 50 }) {
  // Until a dedicated scraper exists, reuse the suggested people feed so callers
  // still receive fresh prospects sourced from LinkedIn.
  return fetchProspects({ userId, limit })
}

export async function fetchProfileLocation({ userId, handle, profileUrl }) {
  const normalizedHandle = normalizeHandle(handle, profileUrl)
  if (!normalizedHandle) return null

  const location = await runWithDriver(userId, async (driver) => {
    return await getProfileLocation(driver, normalizedHandle)
  })

  if (!location) return null
  return {
    handle: normalizedHandle,
    profileUrl: profileUrlFor(normalizedHandle, profileUrl),
    location
  }
}

export async function sendConnectionRequest({ userId, handle, profileUrl, note }) {
  const normalizedHandle = normalizeHandle(handle, profileUrl)
  if (!normalizedHandle) {
    throw new Error('missing_handle')
  }

  const trimmedNote = String(note || '').trim().slice(0, NOTE_MAX_LENGTH)
  const result = await runWithDriver(userId, async (driver) => {
    const connectResult = await driver.connectWithOptionalNote(normalizedHandle, trimmedNote)
    return connectResult
  })

  return {
    requestId: result?.requestId || `conn_${Date.now()}`,
    handle: normalizedHandle,
    profileUrl: profileUrlFor(normalizedHandle, profileUrl),
    note: trimmedNote || null,
    status: result?.status || 'sent'
  }
}

export class LinkedInSmart extends PlaywrightLinkedInSmart {}
