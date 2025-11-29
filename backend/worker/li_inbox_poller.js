/* backend/worker/li_inbox_poller.js */
import { supa } from '../db.js'
import { LinkedInSmart } from '../services/driver_linkedin_smart.js'
import { absorbInbound } from '../services/conversation/ingest.js'
import path from 'node:path'

const norm = s => String(s || '').trim().toLowerCase()

// Per-user retry tracking with exponential backoff
const userRetryState = new Map() // userId -> { failures: number, nextRetry: timestamp }
const MAX_FAILURES = 5
const BASE_BACKOFF_MS = 60_000 // 1 minute
const MAX_BACKOFF_MS = 30 * 60_000 // 30 minutes

async function upsertContactByHandle(handle) {
  const h = norm(handle)
  if (!h) return null
  const found = await supa
    .from('contacts')
    .select('id')
    .eq('platform','linkedin')
    .eq('handle',h)
    .limit(1)
  if (found.data && found.data.length) return found.data[0].id
  const ins = await supa
    .from('contacts')
    .insert({ platform:'linkedin', handle:h, tags:['prospect'] })
    .select('id')
    .maybeSingle()
  return ins?.data?.id || null
}

function getBackoffMs(failures) {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, failures), MAX_BACKOFF_MS)
}

function shouldRetryUser(userId) {
  const state = userRetryState.get(userId)
  if (!state) return true

  const now = Date.now()
  if (now < state.nextRetry) {
    const waitSeconds = Math.round((state.nextRetry - now) / 1000)
    console.log('li_inbox_poller_skip_backoff', {
      userId,
      failures: state.failures,
      nextRetryIn: `${waitSeconds}s`
    })
    return false
  }

  return true
}

function recordUserSuccess(userId) {
  userRetryState.delete(userId)
}

function recordUserFailure(userId, error) {
  const state = userRetryState.get(userId) || { failures: 0, nextRetry: 0 }
  state.failures += 1

  if (state.failures >= MAX_FAILURES) {
    // Cap at MAX_FAILURES and keep max backoff
    state.failures = MAX_FAILURES
  }

  const backoffMs = getBackoffMs(state.failures)
  state.nextRetry = Date.now() + backoffMs

  userRetryState.set(userId, state)

  console.warn('li_inbox_poller_user_failure', {
    userId,
    error: String(error),
    failures: state.failures,
    backoffMs,
    nextRetry: new Date(state.nextRetry).toISOString()
  })
}

async function pollInboxForUser(userId) {
  if (!shouldRetryUser(userId)) {
    return // Skip this user due to backoff
  }

  let driver = null

  try {
    const cookiesPath = path.resolve(`/opt/render/project/src/.data/li_cookies/${userId}.json`)

    driver = new LinkedInSmart({
      cookiesPath,
      userId
    })

    await driver.ensureBrowser()

    // Create a new context for this user
    const context = await driver.browser.newContext({
      viewport: { width: 1420, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      locale: 'en-US',
      timezoneId: 'America/New_York'
    })

    const page = await context.newPage()
    driver.context = context
    driver.page = page

    await driver.init()

    // TODO: Implement pollInbox method in LinkedInSmart driver
    // For now, we'll just verify the session works
    console.log('li_inbox_poller_session_ok', { userId })

    // Clean up
    await page.close({ runBeforeUnload: false }).catch(() => {})
    await context.close().catch(() => {})

    recordUserSuccess(userId)
  } catch (err) {
    const isAuthError = err?.code === 'linkedin_auth_missing' || err?.message?.includes('linkedin_auth_missing')

    if (isAuthError) {
      console.log('li_inbox_poller_auth_missing', {
        userId,
        message: 'Auth failed, will retry with backoff'
      })
    } else {
      console.error('li_inbox_poller_error', {
        userId,
        error: String(err),
        message: err?.message
      })
    }

    recordUserFailure(userId, err)
  } finally {
    // Ensure cleanup even on error
    if (driver) {
      try {
        if (driver.page) await driver.page.close({ runBeforeUnload: false }).catch(() => {})
        if (driver.context) await driver.context.close().catch(() => {})
      } catch {}
    }
  }
}

export async function tickLinkedInInboxPoller() {
  try {
    // Get all users who have LinkedIn integration enabled
    // For now, we'll use a placeholder approach
    // TODO: Query database for users with LinkedIn enabled

    // Example: Poll for a test user
    // Uncomment when ready to use:
    // const testUserId = 'test-user-1'
    // await pollInboxForUser(testUserId)

    console.log('li_inbox_poller_tick', {
      message: 'Inbox poller is ready but needs pollInbox implementation',
      activeBackoffs: userRetryState.size
    })
  } catch (err) {
    console.error('li_inbox_poller_tick_error', {
      error: String(err),
      message: err?.message
    })
  }
}