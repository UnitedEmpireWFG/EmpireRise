import { chromium } from "playwright"
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const LI_USER = process.env.LI_USER
const LI_PASS = process.env.LI_PASS

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)
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

export class LinkedInDriver {
  constructor(opts = {}) {
    this.headful = bool(process.env.LI_HEADFUL, false)
    this.slowMo  = num(process.env.LI_SLOW_MO_MS, 0)
    this.browser = null
    this.context = null
    this.page = null
    this.ready = false
    this.opts = opts   // { cookiesPath?: string }
  }

  _contextIsClosed() {
    try {
      if (!this.context) return true
      if (!this.browser || !this.browser.isConnected()) return true
      return false
    } catch {
      return true
    }
  }

  async launch() {
    console.log('Playwright launching with default Chromium')
    const browser = await chromium.launch({ headless: true })
    this.browser = browser
    this.context = await this.browser.newContext({ viewport: { width: 1420, height: 900 } })
    this.page = await this.context.newPage()
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected && this.browser.isConnected()) {
      return
    }

    if (this.browser && this.browser.close) {
      try {
        await this.browser.close()
      } catch {}
    }

    await this.launch()
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

  async _isLoggedIn() {
    try {
      await this.page.waitForURL(/linkedin\.com\/(feed|mynetwork)/, { timeout: 7000 })
      return true
    } catch { return false }
  }

  async _sessionState() {
    const state = {
      url: '',
      title: '',
      navVisible: false,
      avatarVisible: false,
      loginRedirect: false,
      ok: false,
      reason: 'login_check_failed'
    }

    try { state.url = this.page.url() || '' } catch {}
    try { state.title = await this.page.title() } catch {}

    // Check if URL indicates a login redirect
    state.loginRedirect = /authwall|\/login|checkpoint|uas\/login/i.test(state.url)

    // Check for logged-in UI elements
    try {
      state.navVisible = await this.page.locator('nav.global-nav').first().isVisible({ timeout: 2000 })
    } catch {}
    try {
      state.avatarVisible = await this.page.locator('img.global-nav__me-photo, button.global-nav__me').first().isVisible({ timeout: 2000 })
    } catch {}

    state.ok = !state.loginRedirect && (state.navVisible || state.avatarVisible)

    if (state.loginRedirect) state.reason = 'redirected_to_login'
    else if (state.ok) state.reason = 'ok'
    else state.reason = 'missing_logged_in_ui'

    return state
  }

  async _loginWithCredentials() {
    if (!LI_USER || !LI_PASS) {
      console.warn('li_login_env_missing', {
        hasUser: !!LI_USER,
        hasPass: !!LI_PASS,
      })
      return { ok: false, reason: 'missing_env_creds' }
    }

    try {
      console.log('li_login_starting')

      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })

      await this.page.locator('form.login__form, div.login__form, main').first().waitFor({
        state: 'visible',
        timeout: 15000
      })

      await wait(1500)

      const userSelectors = [
        'input#username',
        'input[autocomplete="username"]',
        'input[name="session_key"]:not([type="hidden"])'
      ]
      const userField = this.page.locator(userSelectors.join(', ')).first()
      await userField.waitFor({ state: 'visible', timeout: 15000 })
      await userField.click()
      await userField.fill(LI_USER)

      const passSelectors = [
        'input#password',
        'input[type="password"][autocomplete="current-password"]',
        'input[name="session_password"]'
      ]
      const passField = this.page.locator(passSelectors.join(', ')).first()
      await passField.waitFor({ state: 'visible', timeout: 15000 })
      await passField.click()
      await passField.fill(LI_PASS)

      console.log('li_login_form_filled')

      const loginButton = this.page.locator(
        'button[type="submit"], button[aria-label*="Sign in"]'
      )
      await loginButton.first().click()

      console.log('li_login_submitted')

      try {
        await this.page.waitForURL('**/feed*', { timeout: 30000 })
      } catch (e) {
        console.warn('li_login_wait_for_feed_timeout', { error: String(e) })
      }

      const state = await this._sessionState()
      console.log('li_login_state_after_creds', { state })

      if (!state.ok) {
        return { ok: false, reason: state.reason || 'post_login_not_ok', url: state.url, title: state.title }
      }

      // Save cookies
      const cookies = await this.context.cookies()
      if (this.opts?.cookiesPath) {
        try {
          const dir = path.dirname(this.opts.cookiesPath)
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(this.opts.cookiesPath, JSON.stringify(cookies, null, 2), 'utf8')
          console.log('li_cookies_persisted', { path: this.opts.cookiesPath, count: cookies.length })
        } catch (err) {
          console.error('li_persist_cookies_error', { error: String(err) })
        }
      }

      return { ok: true, reason: 'login_ok' }
    } catch (err) {
      console.error('li_login_with_creds_error', { error: String(err), message: err?.message })
      return { ok: false, reason: 'exception', error: String(err) }
    }
  }

  async init() {
    if (this.ready) return
    await this.ensureBrowser()

    const tryLogin = async (cookies) => {
      const normalizedCookies = normalizePlaywrightCookies(cookies).map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
      }))
      console.log('li_import_driver_cookies_normalized_sample', normalizedCookies[0])
      const applyCookies = async () => {
        await this.context.addCookies(normalizedCookies)
      }

      try {
        if (this._contextIsClosed()) {
          await this.ensureBrowser()
        }
        await applyCookies()
      } catch (err) {
        const msg = String(err && err.message ? err.message : err)
        const closedError = msg.includes('Target page, context or browser has been closed')

        if (closedError) {
          try {
            await this.ensureBrowser()
            await applyCookies()
          } catch (retryErr) {
            console.error('li_import_driver_run_error', retryErr)
            throw retryErr
          }
        } else {
          console.error('li_import_driver_run_error', err)
          throw err
        }
      }

      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' })
      await wait(2000) // Wait for redirects

      const state = await this._sessionState()

      if (state.ok) {
        this.ready = true
        return true
      }

      // If cookies lead to login page, try credential login
      if (state.loginRedirect) {
        console.log('li_auth_cookies_login_redirect', { reason: state.reason, url: state.url })

        const loginResult = await this._loginWithCredentials()
        console.log('li_auth_login_result', { ok: loginResult.ok, reason: loginResult.reason })

        if (loginResult.ok) {
          this.ready = true
          return true
        }
      }

      return false
    }

    // Try per-user cookies first
    const perUserCookies = await this._cookiesFromPath(this.opts.cookiesPath)
    if (perUserCookies) {
      if (await tryLogin(perUserCookies)) return
    }

    // Fallback to global cookies
    const cookies = await this._cookiesFromPath()
    if (cookies) {
      if (await tryLogin(cookies)) return
    }

    throw new Error('linkedin_auth_missing')
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
    await this.init()
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

  async connectNoNote(handle) {
    await this.init()
    const h = String(handle || '').replace(/^@/,'')
    await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)
    const btn = this.page.locator('button:has-text("Connect")').first()
    if (!(await btn.count())) throw new Error('connect_button_not_found')
    await btn.click().catch(()=>{})
    await wait(400)
    const send = this.page.locator('button:has-text("Send")').last()
    await send.click().catch(()=>{})
    await wait(800)
    return { ok: true }
  }

  async isConnected(handle) {
    await this.init()
    const h = String(handle || '').replace(/^@/,'')
    await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
    await wait(800)
    const msg = this.page.locator('button:has-text("Message")')
    const pending = this.page.locator('button:has-text("Pending")')
    return (await msg.count()) > 0 && (await pending.count()) === 0
  }

  async sendMessageToHandle(handle, text) {
    await this.init()
    const h = String(handle || '').replace(/^@/, '').trim()
    const message = String(text || '').trim()
    if (!h) throw new Error('missing_handle')
    if (!message) throw new Error('missing_text')

    await this.page.goto(`https://www.linkedin.com/in/${encodeURIComponent(h)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)

    const messageBtn = this.page.locator('button:has-text("Message")').first()
    if (!(await messageBtn.count())) throw new Error('message_button_not_found')
    await messageBtn.click().catch(() => {})
    await wait(600)

    const composer = this.page.locator('div[role="textbox"][contenteditable="true"], div.msg-form__contenteditable[contenteditable="true"]').first()
    if (!(await composer.count())) throw new Error('message_composer_not_found')
    await composer.click().catch(() => {})
    await wait(200)
    await composer.press('Control+A').catch(async () => {
      await composer.press('Meta+A').catch(() => {})
    })
    await composer.press('Backspace').catch(() => {})
    await composer.type(message).catch(async () => {
      await this.page.keyboard.type(message)
    })
    await wait(200)

    let sendBtn = this.page.locator('button[aria-label="Send now"]').first()
    if (!(await sendBtn.count())) sendBtn = this.page.locator('button:has-text("Send")').last()
    if (!(await sendBtn.count())) throw new Error('send_button_not_found')
    await sendBtn.click().catch(() => {})
    await wait(800)

    return { ok: true }
  }

  async close() {
    try { await this.page?.close() } catch {}
    try { await this.context?.close() } catch {}
    try { await this.browser?.close() } catch {}
  }
}


