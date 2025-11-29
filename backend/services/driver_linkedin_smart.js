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
const initRetryCount = new Map()
const MAX_INIT_RETRIES = 3
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
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-pings',
      '--password-store=basic',
      '--use-mock-keychain',
      '--force-color-profile=srgb',
      '--disable-accelerated-2d-canvas',
      '--disable-webgl',
      '--disable-webgl2',
      '--window-size=1420,900'
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
    this._initLock = null
    this._contextRefCount = 0
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
    const prevReady = this.ready
    this.ready = false
    this._contextRefCount++

    try {
      context = await this.browser.newContext({
        viewport: { width: 1420, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        javaScriptEnabled: true,
        locale: 'en-US',
        timezoneId: 'America/New_York'
      })
      page = await context.newPage()
      this.context = context
      this.page = page
      await this.init()
      return await run()
    } finally {
      this._contextRefCount--
      this.ready = prevReady
      this.context = prevContext
      this.page = prevPage

      // Close page and context in correct order
      if (page) {
        try {
          await page.close({ runBeforeUnload: false })
        } catch (err) {
          console.warn('li_page_close_error', { userId: this.userId, error: err?.message })
        }
      }

      if (context) {
        try {
          await context.close()
        } catch (err) {
          console.warn('li_context_close_error', { userId: this.userId, error: err?.message })
        }
      }
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
      feedVisible: false,
      loginFormInteractive: false,
      loginRedirect: false,
      signedOutForm: false,
      ok: false,
      reason: 'login_check_failed'
    }

    try { state.url = this.page.url() || '' } catch {}
    try { state.title = await this.page.title() } catch {}

    // Check if URL indicates a login redirect
    state.loginRedirect = /authwall|\/login|checkpoint|uas\/login/i.test(state.url)

    // Wait up to 12 seconds with smart polling for logged-in UI elements
    const LOGGED_IN_SELECTORS = [
      'nav.global-nav',
      'img.global-nav__me-photo',
      'button.global-nav__me',
      'a[href*="/messaging/"]',
      'a[href*="/mynetwork/"]',
      'div.scaffold-layout__main',
      'main.scaffold-layout__main'
    ]

    try {
      await this.page.locator(LOGGED_IN_SELECTORS.join(', ')).first().waitFor({
        state: 'visible',
        timeout: 12000
      })
    } catch {
      // Continue to check individual elements
    }

    // Check each logged-in indicator with shorter timeout now
    try {
      state.navVisible = await this.page.locator('nav.global-nav').first().isVisible({ timeout: 1000 })
    } catch {}
    try {
      state.avatarVisible = await this.page.locator('img.global-nav__me-photo, button.global-nav__me').first().isVisible({ timeout: 1000 })
    } catch {}
    try {
      state.feedControlVisible = await this.page.locator('a[href*="/messaging/"], a[href*="/mynetwork/"]').first().isVisible({ timeout: 1000 })
    } catch {}
    try {
      state.feedVisible = await this.page.locator('div.scaffold-layout__main, main.scaffold-layout__main').first().isVisible({ timeout: 1000 })
    } catch {}

    // Check for login form presence (multiple selector strategies)
    try {
      const loginSelectors = [
        'form.login__form',
        'div.login__form',
        'input#username',
        'input[name="session_key"]',
        'input[autocomplete="username"]'
      ]
      const loginForm = this.page.locator(loginSelectors.join(', ')).first()
      const isVisible = await loginForm.isVisible({ timeout: 1000 })
      const isEnabled = isVisible ? await loginForm.isEnabled({ timeout: 500 }).catch(() => false) : false
      state.loginFormInteractive = isVisible && isEnabled
    } catch {}

    // Also check for signed-out specific elements
    try {
      state.signedOutForm = await this.page.locator('input[name="session_key"], form#app__container').first().isVisible({ timeout: 1000 })
    } catch {}

    // Session is OK if ANY logged-in UI is visible AND we're NOT on a login page
    state.ok = !state.loginRedirect && !state.loginFormInteractive && !state.signedOutForm &&
               (state.navVisible || state.avatarVisible || state.feedControlVisible || state.feedVisible)

    // Determine the reason
    if (state.loginRedirect) state.reason = 'redirected_to_login'
    else if (state.loginFormInteractive) state.reason = 'login_form_visible'
    else if (state.signedOutForm) state.reason = 'signed_out_view'
    else if (state.ok) state.reason = 'ok'
    else state.reason = 'missing_logged_in_ui'

    return state
  }

  async hasValidLinkedInSession() {
    try {
      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 20_000 })
    } catch (err) {
      console.warn('li_feed_nav_error', { userId: this.userId, message: err?.message, url: this.page?.url?.() })
    }

    // Wait for redirects to stabilize (LinkedIn may temporarily redirect to /login then back)
    await new Promise(r => setTimeout(r, 3000))

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

    let currentUrl = ''
    let currentTitle = ''

    try {
      // Ensure we have a page
      if (!this.page) {
        this.page = await this.context.newPage()
      }

      console.log('li_login_starting', { userId: this.userId })

      // Go directly to the login page
      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })

      // Wait for login form container to be visible first
      await this.page.locator('form.login__form, div.login__form, main').first().waitFor({
        state: 'visible',
        timeout: 15000
      })

      // Wait a moment for form to fully render
      await new Promise(r => setTimeout(r, 1500))

      // Robust username field selector - catches any visible username/email input
      const userSelectors = [
        'input#username:not([type="hidden"])',
        'input[name="session_key"]:not([type="hidden"])',
        'input[autocomplete="username"]:not([type="hidden"])',
        'input[type="email"]:not([type="hidden"])',
        'input[type="text"]:not([type="hidden"])'
      ]
      const userField = this.page.locator(userSelectors.join(', ')).first()
      await userField.waitFor({ state: 'visible', timeout: 30000 })
      await userField.click()
      await userField.fill(LI_USER)

      console.log('li_login_username_filled', { userId: this.userId })

      // Robust password field selector
      const passSelectors = [
        'input#password:not([type="hidden"])',
        'input[name="session_password"]:not([type="hidden"])',
        'input[type="password"]:not([type="hidden"])'
      ]
      const passField = this.page.locator(passSelectors.join(', ')).first()
      await passField.waitFor({ state: 'visible', timeout: 30000 })
      await passField.click()
      await passField.fill(LI_PASS)

      console.log('li_login_form_filled', { userId: this.userId })

      // Robust submit button selector
      const loginButton = this.page.locator([
        'button[type="submit"]',
        'button[aria-label*="Sign in" i]',
        'button:has-text("Sign in")'
      ].join(', '))
      await loginButton.first().click()

      console.log('li_login_submitted', { userId: this.userId })

      // Wait for navigation. Prefer feed, but do not hard fail if not exact.
      try {
        await this.page.waitForURL('**/feed*', { timeout: 30000 })
      } catch (e) {
        // If we do not hit /feed directly, continue and rely on _sessionState.
        console.warn('li_login_wait_for_feed_timeout', { userId: this.userId, error: String(e) })
      }

      // Capture current state for diagnostics
      try { currentUrl = this.page.url() || '' } catch {}
      try { currentTitle = await this.page.title() } catch {}

      // Check for error messages on the page
      let errorMessage = null
      try {
        const errorSelectors = [
          '.form__label--error',
          '.artdeco-inline-feedback--error',
          'div[role="alert"]',
          '.alert-danger'
        ]
        const errorEl = this.page.locator(errorSelectors.join(', ')).first()
        if (await errorEl.isVisible({ timeout: 2000 })) {
          errorMessage = await errorEl.textContent()
        }
      } catch {}

      if (errorMessage) {
        console.warn('li_login_error_message', {
          userId: this.userId,
          errorMessage: errorMessage.trim(),
          url: currentUrl,
          title: currentTitle
        })
      }

      // Use the existing session state logic to verify successful login
      const state = await this._sessionState()
      console.log('li_login_state_after_creds', {
        userId: this.userId,
        state,
        errorMessage: errorMessage?.trim() || null
      })

      if (!state.ok) {
        // Capture screenshot on failure
        await this._captureLoginErrorScreenshot(currentUrl, currentTitle, errorMessage)

        return {
          ok: false,
          reason: state.reason || 'post_login_not_ok',
          url: currentUrl,
          title: currentTitle,
          errorMessage: errorMessage?.trim() || null
        }
      }

      // Logged in successfully. Extract cookies from the Playwright context.
      const cookies = await this.context.cookies()
      this.cookies = cookies

      // Persist cookies for future runs
      await this._persistCookies(cookies)

      console.log('li_login_success', {
        userId: this.userId,
        cookieCount: cookies.length
      })

      return { ok: true, reason: 'login_ok', url: currentUrl, title: currentTitle }
    } catch (err) {
      try { currentUrl = this.page?.url() || '' } catch {}
      try { currentTitle = await this.page?.title() } catch {}

      // Capture screenshot on exception
      await this._captureLoginErrorScreenshot(currentUrl, currentTitle, err?.message)

      console.error('li_login_with_creds_error', {
        userId: this.userId,
        error: String(err),
        message: err?.message,
        url: currentUrl,
        title: currentTitle
      })
      return {
        ok: false,
        reason: 'exception',
        error: String(err),
        url: currentUrl,
        title: currentTitle
      }
    }
  }

  async _captureLoginErrorScreenshot(url, title, errorMessage) {
    try {
      if (!this.page) return

      const timestamp = Date.now()
      const screenshotPath = `/tmp/li_login_error_${this.userId || 'unknown'}_${timestamp}.png`

      await this.page.screenshot({
        path: screenshotPath,
        fullPage: false
      })

      console.log('li_login_error_screenshot', {
        userId: this.userId,
        path: screenshotPath,
        url,
        title,
        errorMessage: errorMessage || null
      })
    } catch (screenshotErr) {
      console.warn('li_login_screenshot_failed', {
        userId: this.userId,
        error: String(screenshotErr)
      })
    }
  }

  _hasAuthCookie(cookies = []) {
    return cookies.some(c => c?.name === 'li_at' || c?.name === 'li_rm')
  }

  async init() {
    // Prevent concurrent init calls
    if (this._initLock) {
      await this._initLock
      return
    }

    if (this.ready) return

    this._initLock = this._doInit()
    try {
      await this._initLock
    } finally {
      this._initLock = null
    }
  }

  async _doInit() {
    if (!this.browser) await this.ensureBrowser()

    const retryKey = this.userId || 'global'
    const retries = initRetryCount.get(retryKey) || 0

    // Exponential backoff: 2s, 4s, 8s
    if (retries > 0) {
      const backoffMs = Math.min(2000 * Math.pow(2, retries - 1), 8000)
      console.log('li_init_backoff', { userId: this.userId, retries, backoffMs })
      await wait(backoffMs)
    }

    try {
      return await this._doInitAttempt()
    } catch (err) {
      const isAuthError = err?.code === 'linkedin_auth_missing' || err?.message?.includes('linkedin_auth_missing')

      if (isAuthError && retries < MAX_INIT_RETRIES) {
        initRetryCount.set(retryKey, retries + 1)
      } else {
        // Reset retry count on success or max retries
        initRetryCount.delete(retryKey)
      }

      throw err
    }
  }

  async _doInitAttempt() {
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

      // Log session state details when not OK
      if (!sessionState?.ok) {
        console.log('li_session_check_failed', {
          userId: this.userId,
          url: sessionState?.url,
          title: sessionState?.title,
          reason: sessionState?.reason,
          loginRedirect: sessionState?.loginRedirect,
          loginFormInteractive: sessionState?.loginFormInteractive,
          signedOutForm: sessionState?.signedOutForm,
          navVisible: sessionState?.navVisible,
          avatarVisible: sessionState?.avatarVisible,
          feedVisible: sessionState?.feedVisible
        })
      }

      if (sessionState?.ok) {
        this.ready = true
        authFailureLogged.delete(this.userId)
        // Reset retry count on success
        const retryKey = this.userId || 'global'
        initRetryCount.delete(retryKey)
        return
      }

      // If cookies lead to login page or login form is visible, try credential login
      const needsLogin = sessionState && (
        sessionState.loginRedirect ||
        sessionState.loginFormInteractive ||
        sessionState.signedOutForm
      )

      if (needsLogin) {
        console.log('li_auth_cookies_login_redirect', {
          userId: this.userId,
          reason: sessionState.reason,
          url: sessionState.url,
          loginRedirect: sessionState.loginRedirect,
          loginFormInteractive: sessionState.loginFormInteractive
        })

        const loginResult = await this._loginWithCredentials()
        console.log('li_auth_login_result', {
          userId: this.userId,
          ok: loginResult.ok,
          reason: loginResult.reason,
          url: loginResult.url || sessionState.url,
          title: loginResult.title || sessionState.title
        })

        if (loginResult.ok) {
          this.ready = true
          authFailureLogged.delete(this.userId)
          // Reset retry count on success
          const retryKey = this.userId || 'global'
          initRetryCount.delete(retryKey)
          return
        } else {
          // Log failure details
          console.warn('li_login_failed_detail', {
            userId: this.userId,
            reason: loginResult.reason,
            error: loginResult.error,
            url: loginResult.url,
            title: loginResult.title
          })
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
        feedVisible: lastSessionState?.feedVisible || false,
        loginFormInteractive: lastSessionState?.loginFormInteractive || false,
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
    // Wait for any active contexts to finish
    let waitCount = 0
    while (this._contextRefCount > 0 && waitCount < 30) {
      await new Promise(r => setTimeout(r, 100))
      waitCount++
    }

    if (this._contextRefCount > 0) {
      console.warn('li_driver_shutdown_with_active_contexts', {
        userId: this.userId,
        refCount: this._contextRefCount
      })
    }

    await this._closeContext(this.context)
    this.context = null
    this.page = null
    this.ready = false

    if (shutdownBrowser && this.browser) {
      const browser = this.browser
      this.browser = null
      try { await browser.close() } catch {}
      console.log('li_driver_browser_closed', { userId: this.userId })
    }
  }
}


