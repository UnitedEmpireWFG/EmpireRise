import { chromium } from "playwright"
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const LI_USER = process.env.LI_USER
const LI_PASS = process.env.LI_PASS

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
let sharedBrowser = null
let sharedBrowserLaunching = null
const authFailureLogged = new Set()
function normalizePlaywrightCookies(rawCookies = []) {
  return rawCookies.map((c) => {
    const cookie = { ...c }

    if (cookie.sameSite) {
      const v = String(cookie.sameSite).toLowerCase()
      if (v === 'strict') {
        cookie.sameSite = 'Strict'
      } else if (v === 'lax') {
        cookie.sameSite = 'Lax'
      } else if (v === 'none') {
        cookie.sameSite = 'None'
      } else {
        delete cookie.sameSite
      }
    }

    if (cookie.secure != null) {
      cookie.secure = Boolean(cookie.secure)
    }
    if (cookie.httpOnly != null) {
      cookie.httpOnly = Boolean(cookie.httpOnly)
    }

    return cookie
  })
}
const CARD_SELECTORS = [
  '[data-test-reusable-connection-suggestion-card]',
  'li.discover-person-card',
  'div.discover-person-card__container',
  'li.reusable-search__result-container'
]
const SUGGESTED_URLS = [
  'https://www.linkedin.com/mynetwork/grow/',
  'https://www.linkedin.com/mynetwork/discover-hub/people/',
  'https://www.linkedin.com/mynetwork/'
]

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser
  if (sharedBrowserLaunching) return sharedBrowserLaunching

  sharedBrowserLaunching = chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-setuid-sandbox',
    ],
  }).then(browser => {
    sharedBrowser = browser
    sharedBrowserLaunching = null
    console.log('li_driver_browser_launch', { pid: process.pid })
    browser.on('disconnected', () => { sharedBrowser = null })
    return browser
  }).catch(err => {
    sharedBrowserLaunching = null
    sharedBrowser = null
    throw err
  })

  return sharedBrowserLaunching
}

process.once('exit', async () => {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    try { await sharedBrowser.close() } catch {}
  }
})

export class LinkedInSmart {
  constructor(opts = {}) {
    this.browser = null
    this.context = null
    this.page = null
    this.ready = false
    this.opts = opts   // { cookiesPath?: string, userId?: string }
    this.userId = opts.userId || null
  }

  async ensureBrowser() {
    if (this.browser) return
    this.browser = await getBrowser()
  }

  async _withSession(run) {
    await this.ensureBrowser()
    let context = null
    let page = null
    const prevContext = this.context
    const prevPage = this.page
    this.ready = false
    try {
      context = await this.browser.newContext({ viewport: { width: 1420, height: 900 } })
      page = await context.newPage()
      this.context = context
      this.page = page
      await this.init()
      return await run()
    } finally {
      this.ready = false
      this.context = prevContext
      this.page = prevPage
      await this._closePage(page)
      await this._closeContext(context)
    }
  }

  async _closePage(page) {
    try { await page?.close() } catch {}
  }

  async _closeContext(context) {
    try { await context?.close() } catch {}
  }

  async _cookiesFromPath(overridePath) { 
    const p = overridePath || process.env.LI_COOKIES_PATH
    if (!p) return null
    try {
      const raw = await fs.readFile(path.resolve(p), 'utf-8')
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : null
    } catch { return null }
  }

  async _persistCookies(cookies) {
    try {
      if (!this.opts?.cookiesPath) {
        console.warn('li_persist_cookies_no_path', { userId: this.userId })
        return
      }

      const dir = path.dirname(this.opts.cookiesPath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.opts.cookiesPath, JSON.stringify(cookies, null, 2), 'utf8')

      console.log('li_cookies_persisted', {
        userId: this.userId,
        cookies_length: Array.isArray(cookies) ? cookies.length : 0,
        path: this.opts.cookiesPath,
      })
    } catch (err) {
      console.error('li_persist_cookies_error', {
        userId: this.userId,
        path: this.opts?.cookiesPath,
        error: String(err),
      })
    }
  }

  async _sessionState() {
    const state = {
      url: '',
      title: '',
      navVisible: false,
      avatarVisible: false,
      feedControlVisible: false,
      signedOutForm: false,
      loginRedirect: false,
      ok: false,
      reason: 'login_check_failed'
    }

    try { state.url = this.page.url() || '' } catch {}
    try { state.title = await this.page.title() } catch {}

    try {
      state.navVisible = await this.page.locator('nav.global-nav').first().isVisible({ timeout: 2000 })
    } catch {}
    try {
      state.avatarVisible = await this.page.locator('img.global-nav__me-photo, button.global-nav__me').first().isVisible({ timeout: 2000 })
    } catch {}
    try {
      state.feedControlVisible = await this.page.locator('a[href*="/messaging/"], a[href*="/mynetwork/"]').first().isVisible({ timeout: 2000 })
    } catch {}
    try {
      state.signedOutForm = await this.page.locator('input[name="session_key"], form#app__container').first().isVisible({ timeout: 2000 })
    } catch {}

    state.loginRedirect = /authwall|login|checkpoint/i.test(state.url)
    state.ok = !state.loginRedirect && !state.signedOutForm && (state.navVisible || state.avatarVisible || state.feedControlVisible)

    if (state.loginRedirect) state.reason = 'redirected_to_login'
    else if (state.signedOutForm) state.reason = 'signed_out_view'
    else if (state.ok) state.reason = 'ok'
    else state.reason = 'missing_logged_in_ui'

    return state
  }

  async hasValidLinkedInSession() {
    try {
      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle', timeout: 20_000 })
    } catch (err) {
      console.warn('li_feed_nav_error', { userId: this.userId, message: err?.message, url: this.page?.url?.() })
    }

    return await this._sessionState()
  }

  async _loginWithCredentials() {
    if (!LI_USER || !LI_PASS) {
      console.warn('li_login_env_missing', {
        userId: this.userId,
        hasUser: !!LI_USER,
        hasPass: !!LI_PASS,
      })
      return { ok: false, reason: 'missing_env_creds' }
    }

    try {
      // Ensure we have a page
      if (!this.page) {
        this.page = await this.context.newPage()
      }

      // Go directly to the login page
      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle', timeout: 30000 })

      // Fill credentials
      await this.page.fill('input[name="session_key"]', LI_USER)
      await this.page.fill('input[name="session_password"]', LI_PASS)

      // Click the sign in button
      const loginButton = this.page.locator('button[type="submit"], button[aria-label*="Sign in"]')
      await loginButton.first().click()

      // Wait for navigation. Prefer feed, but do not hard fail if not exact.
      try {
        await this.page.waitForURL('**/feed*', { timeout: 30000 })
      } catch (e) {
        // If we do not hit /feed directly, continue and rely on _sessionState.
        console.warn('li_login_wait_for_feed_timeout', { userId: this.userId, error: String(e) })
      }

      // Use the existing session state logic
      const state = await this._sessionState()
      console.log('li_login_state_after_creds', { userId: this.userId, state })

      if (!state.ok) {
        return { ok: false, reason: state.reason || 'post_login_not_ok' }
      }

      // Logged in. Grab cookies from the Playwright context.
      const cookies = await this.context.cookies()
      this.cookies = cookies

      // Persist cookies for future runs
      await this._persistCookies(cookies)

      return { ok: true, reason: 'login_ok' }
    } catch (err) {
      console.error('li_login_with_creds_error', {
        userId: this.userId,
        error: String(err),
      })
      return { ok: false, reason: 'exception', error: String(err) }
    }
  }

  _hasAuthCookie(cookies = []) {
    return cookies.some(c => c?.name === 'li_at' || c?.name === 'li_rm')
  }

  async init() {
    if (this.ready) return
    if (!this.browser) await this.ensureBrowser()

    // Try per-user cookies first
    const candidates = []
    const perUserCookies = await this._cookiesFromPath(this.opts.cookiesPath)
    if (perUserCookies) candidates.push(perUserCookies)

    const fallbackCookies = await this._cookiesFromPath()
    if (fallbackCookies) candidates.push(fallbackCookies)

    let sawAuthCookie = false
    let lastSessionState = null

    for (const rawCookies of candidates) {
      const normalizedCookies = normalizePlaywrightCookies(rawCookies).map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
      }))

      const hasAuthCookie = this._hasAuthCookie(normalizedCookies)
      console.log("li_auth_cookies_debug", {
        userId: this.userId,
        cookieCount: normalizedCookies?.length || 0,
        hasAuthCookie,
      })

      if (!hasAuthCookie) continue

      sawAuthCookie = true
      this.cookies = normalizedCookies
      console.log('li_import_driver_cookies_normalized_sample', normalizedCookies[0])
      try {
        await this.context.addCookies(normalizedCookies)
      } catch (err) {
        console.error('li_import_driver_run_error', err)
        throw err
      }

      const sessionState = await this.hasValidLinkedInSession()
      if (sessionState?.ok) {
        this.ready = true
        authFailureLogged.delete(this.userId)
        return
      }

      // If cookies lead to login or signed out views, try credential login once
      if (sessionState && (sessionState.loginRedirect || sessionState.signedOutForm)) {
        console.log('li_auth_cookies_login_redirect', {
          userId: this.userId,
          reason: sessionState.reason,
          url: sessionState.url,
        })

        const loginResult = await this._loginWithCredentials()
        console.log('li_auth_login_result', {
          userId: this.userId,
          ok: loginResult.ok,
          reason: loginResult.reason,
        })

        if (loginResult.ok) {
          this.ready = true
          authFailureLogged.delete(this.userId)
          return
        }
      }

      lastSessionState = sessionState
    }

    const authError = new Error("linkedin_auth_missing")
    authError.code = "linkedin_auth_missing"

    if (!authFailureLogged.has(this.userId)) {
      console.error("li_auth_missing_detail", {
        userId: this.userId,
        cookieCount: this.cookies?.length || 0,
        cookieNames: (this.cookies || []).map(c => c.name).sort(),
        pageUrl: lastSessionState?.url || null,
        pageTitle: lastSessionState?.title || null,
        navVisible: lastSessionState?.navVisible || false,
        avatarVisible: lastSessionState?.avatarVisible || false,
        feedControlVisible: lastSessionState?.feedControlVisible || false,
        loginRedirect: lastSessionState?.loginRedirect || false,
        signedOutView: lastSessionState?.signedOutForm || false,
        reason: sawAuthCookie ? (lastSessionState?.reason || 'login_check_failed') : 'no_auth_cookie'
      })
      authFailureLogged.add(this.userId)
    }

    throw authError
  }

  async _extractProfileMetaFromCard(card) {
    const link = await card.locator('a[href*="/in/"]').first().getAttribute('href').catch(()=>null)
    const match = link?.match(/linkedin\.com\/in\/([^\/?#]+)/)
    const handle = match ? decodeURIComponent(match[1]) : null

    const name = await this._firstText(card, [
      '[data-test-reusable-connection-suggestion-full-name]',
      '.discover-person-card__name',
      '.entity-result__title-text span[aria-hidden="true"]',
      'span[dir="ltr"] strong',
      'span[dir="ltr"]'
    ])
    const headline = await this._firstText(card, [
      '[data-test-reusable-connection-suggestion-headline]',
      '.discover-person-card__occupation',
      '.entity-result__primary-subtitle',
      '.discover-person-card__headline',
      '.artdeco-entity-lockup__subtitle'
    ])
    const location = await this._firstText(card, [
      '[data-test-reusable-connection-suggestion-subdescription]',
      '.discover-person-card__location',
      '.entity-result__secondary-subtitle',
      '.discover-person-card__meta',
      '.artdeco-entity-lockup__caption'
    ])
    const openBadge = await card.locator('text=/open to work/i').count().catch(()=>0)

    return {
      handle,
      name,
      headline,
      location,
      open_to_work: openBadge > 0
    }
  }

  async suggestedPeopleCanada(limit = 50) {
    return this._withSession(async () => {
      const excludeCSV = process.env.LI_EXCLUDE_TERMS || ''
      const preferOTW = bool(process.env.LI_PREFER_OPEN_TO_WORK, true)

      const out = []
      const seenHandles = new Set()

      let haveSuggestions = false
      for (const url of SUGGESTED_URLS) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
        for (const sel of CARD_SELECTORS) {
          const ready = await this.page.locator(sel).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false)
          if (ready) { haveSuggestions = true; break }
        }
        if (haveSuggestions) break
      }
      if (!haveSuggestions) throw new Error('linkedin_suggestions_not_found')

      for (let scroll=0; scroll<12 && out.length < limit; scroll++) {
        const cards = await this.page.locator(CARD_SELECTORS.join(', ')).all()
        for (const card of cards) {
          const meta = await this._extractProfileMetaFromCard(card)
          if (!meta.handle) continue
          if (seenHandles.has(meta.handle)) continue

          const canadian = looksCanadian({ locationText: meta.location })
          const clean    = notInExcluded([meta.headline, meta.location].join(' | '), excludeCSV)

          if (!canadian || !clean) continue
          seenHandles.add(meta.handle)
          out.push(meta)
          if (out.length >= limit) break
        }

        await this.page.keyboard.press('End').catch(()=>{})
        await wait(1500)
      }

      if (preferOTW) {
        out.sort((a,b) => (b.open_to_work === true) - (a.open_to_work === true))
      }
      const seen = new Set()
      return out.filter(x => !seen.has(x.handle) && seen.add(x.handle))
    })
  }

  async _firstText(card, selectors = []) {
    for (const sel of selectors) {
      try {
        const loc = card.locator(sel).first()
        if (!(await loc.count())) continue
        const txt = await loc.textContent()
        if (txt && txt.trim()) return txt.trim()
      } catch {}
    }
    try {
      const txt = await card.innerText()
      return (txt || '').split('\n').map(t => t.trim()).find(Boolean) || ''
    } catch { return '' }
  }

  async _prepareProfile(handle) {
    await this.init()
    const h = String(handle || '').replace(/^@/, '')
    if (!h) throw new Error('missing_handle')
    await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)

    const alreadyMessage = await this.page.locator('button:has-text("Message")').count().catch(() => 0)
    const pending = await this.page.locator('button:has-text("Pending")').count().catch(() => 0)
    if (alreadyMessage > 0 && pending === 0) {
      return { status: 'already_connected' }
    }
    if (pending > 0) {
      return { status: 'pending' }
    }

    const btn = this.page.locator('button:has-text("Connect")').first()
    if (!(await btn.count())) throw new Error('connect_button_not_found')
    await btn.click().catch(() => {})
    await wait(400)
    return { status: 'prompt_open' }
  }

  async connectWithOptionalNote(handle, note) {
    return this._withSession(async () => {
      const state = await this._prepareProfile(handle)
      if (state.status === 'already_connected' || state.status === 'pending') {
        return { ok: true, status: state.status, requestId: null }
      }

      const trimmed = String(note || '').trim()
      if (trimmed) {
        const addNote = this.page.locator('button:has-text("Add a note")').first()
        if (!(await addNote.count())) throw new Error('add_note_button_not_found')
        await addNote.click().catch(() => {})
        await wait(400)

        const textarea = this.page.locator('textarea[name="message"], textarea#custom-message')
        if (!(await textarea.count())) throw new Error('note_textarea_not_found')
        await textarea.fill(trimmed)
        await wait(200)

        const send = this.page.locator('button:has-text("Send")').last()
        await send.click().catch(() => {})
        await wait(800)
        return { ok: true, status: 'sent_with_note', requestId: `li_conn_${Date.now()}` }
      }

      const send = this.page.locator('button:has-text("Send")').last()
      await send.click().catch(() => {})
      await wait(800)
      return { ok: true, status: 'sent', requestId: `li_conn_${Date.now()}` }
    })
  }

  async connectNoNote(handle) {
    return this.connectWithOptionalNote(handle, '')
  }

  async profileLocation(handle) {
    return this._withSession(async () => {
      const h = String(handle || '').replace(/^@/, '')
      if (!h) throw new Error('missing_handle')

      await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
      await wait(900)

      const selectors = [
        '.pv-text-details__left-panel div.text-body-small.inline',
        'div.text-body-small.inline.t-black--light.break-words',
        '[data-test-id="location"]',
        'section.pv-contact-info__contact-type.ci-address .pv-contact-info__ci-container',
        'main li.t-14.t-normal span[aria-hidden="true"]'
      ]

      const location = await this._firstText(this.page, selectors)
      return location || null
    })
  }

  async isConnected(handle) {
    return this._withSession(async () => {
      const h = String(handle || '').replace(/^@/,'')
      await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
      await wait(800)
      const msg = this.page.locator('button:has-text("Message")')
      const pending = this.page.locator('button:has-text("Pending")')
      return (await msg.count()) > 0 && (await pending.count()) === 0
    })
  }

  async close() {
    await this.shutdown({ shutdownBrowser: false })
  }

  async shutdown({ shutdownBrowser = false } = {}) {
    await this._closeContext(this.context)
    this.context = null
    this.page = null
    this.ready = false

    if (shutdownBrowser && this.browser) {
      const browser = this.browser
      this.browser = null
      try { await browser.close() } catch {}
      console.log('li_driver_browser_closed')
    }
  }
}


