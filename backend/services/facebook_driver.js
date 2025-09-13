/* backend/services/facebook_driver.js */
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)

export class FacebookDriver {
  constructor() {
    this.headful = bool(process.env.FB_HEADFUL, false)
    this.slowMo  = num(process.env.FB_SLOW_MO_MS, 0)
    this.browser = null
    this.context = null
    this.page = null
    this.ready = false
  }

  async launch() {
    // If your host needs no-sandbox flags, uncomment:
    // this.browser = await chromium.launch({ headless: !this.headful, slowMo: this.slowMo, args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] })
    this.browser = await chromium.launch({ headless: !this.headful, slowMo: this.slowMo })
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
      viewport: { width: 1420, height: 900 }
    })
    this.page = await this.context.newPage()
  }

  async _cookiesFromPath() {
    const p = process.env.FB_COOKIES_PATH
    if (!p) return null
    try {
      const full = path.resolve(p)
      const raw = await fs.readFile(full, 'utf-8')
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : null
    } catch { return null }
  }

  async _isLoggedIn() {
    try {
      await this.page.waitForURL(/messenger\.com\/t|facebook\.com\/messages\/t/, { timeout: 8000 })
      return true
    } catch { return false }
  }

  async _loginWithPassword(email, password) {
    await this.page.goto('https://www.facebook.com/login.php', { waitUntil: 'domcontentloaded' })
    await this.page.fill('input[name="email"]', email)
    await this.page.fill('input[name="pass"]',  password)
    await Promise.all([
      this.page.click('button[name="login"]'),
      this.page.waitForLoadState('domcontentloaded')
    ])
    await this.page.goto('https://www.messenger.com/', { waitUntil: 'domcontentloaded' })
    if (!(await this._isLoggedIn())) throw new Error('fb_login_failed_or_checkpoint')
  }

  async init() {
    if (this.ready) return
    if (!this.browser) await this.launch()

    const cookies = await this._cookiesFromPath()
    if (cookies) {
      await this.context.addCookies(cookies.map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.facebook.com')
      })))
      await this.page.goto('https://www.messenger.com/', { waitUntil: 'domcontentloaded' })
      if (await this._isLoggedIn()) { this.ready = true; return }
    }

    const email = process.env.FB_EMAIL
    const pass  = process.env.FB_PASSWORD
    if (email && pass) {
      await this._loginWithPassword(email, pass)
      this.ready = true
      return
    }

    throw new Error('facebook_auth_missing: set FB_COOKIES_PATH or FB_EMAIL/FB_PASSWORD')
  }

  async openThread(idOrUsername) {
    const slug = String(idOrUsername || '').replace(/^@/, '')
    if (!slug) throw new Error('fb_missing_username')
    await this.page.goto(`https://www.messenger.com/t/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' })
    await this.page.locator('[contenteditable="true"]').first().waitFor({ timeout: 12000 })
  }

  async sendMessage(idOrUsername, text) {
    await this.init()
    await this.openThread(idOrUsername)
    const composer = this.page.locator('[contenteditable="true"]').first()
    await composer.click()
    await composer.fill(text)
    await wait(250 + Math.random()*350)
    await composer.press('Enter')
    await wait(800)
    return { ok: true }
  }

  // Returns [{ username, text, ts }]
  async pollInbox(limit = 8) {
    await this.init()
    await this.page.goto('https://www.messenger.com/', { waitUntil: 'domcontentloaded' })
    const rows = this.page.locator('[role="row"]')
    const count = Math.min(await rows.count().catch(()=>0), limit)
    const out = []

    for (let i=0; i<count; i++) {
      const row = rows.nth(i)
      const anchor = row.locator('a[href^="/t/"]').first()
      const href = await anchor.getAttribute('href').catch(()=>null)
      if (!href) continue
      await row.click()
      await this.page.waitForTimeout(600)
      const bubbles = this.page.locator('div[role="main"] div[dir="auto"]')
      const lastText = (await bubbles.last().textContent().catch(()=>''))?.trim() || ''
      if (!lastText) continue
      const m = href.match(/\/t\/([^/?#]+)/)
      const username = m ? decodeURIComponent(m[1]) : null
      out.push({ username, text: lastText, ts: Date.now() })
      await wait(300)
    }

    return out
  }

  async close() {
    try { await this.page?.close() } catch {}
    try { await this.context?.close() } catch {}
    try { await this.browser?.close() } catch {}
    this.ready = false
  }
}