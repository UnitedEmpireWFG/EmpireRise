import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import pRetry from 'p-retry'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export class LinkedInDriver {
  constructor(opts = {}) {
    this.headful = String(process.env.LI_HEADFUL || 'false') === 'true'
    this.slowMo = Number(process.env.LI_SLOW_MO_MS || 0) || 0
    this.context = null
    this.page = null
    this.browser = null
    this.ready = false
    this.opts = opts
  }

  async _newBrowser() {
    // If your host blocks sandbox, uncomment:
    // return chromium.launch({ headless: !this.headful, slowMo: this.slowMo, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] })
    return chromium.launch({ headless: !this.headful, slowMo: this.slowMo })
  }

  async _cookiesFromPath() {
    const p = process.env.LI_COOKIES_PATH
    if (!p) return null
    try {
      const full = path.resolve(p)
      const raw = await fs.readFile(full, 'utf-8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
    } catch {}
    return null
  }

  async init() {
    if (this.ready) return
    this.browser = await this._newBrowser()
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
      viewport: { width: 1420, height: 900 }
    })
    this.page = await this.context.newPage()

    // Cookie-first
    const cookies = await this._cookiesFromPath()
    if (cookies) {
      await this.context.addCookies(cookies.map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
      })))
      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' })
      if (await this._isLoggedIn()) { this.ready = true; return }
    }

    // Fallback: password (one-time to capture cookies)
    const email = process.env.LI_EMAIL
    const password = process.env.LI_PASSWORD
    if (email && password) {
      await this._loginWithPassword(email, password)
      this.ready = true
      return
    }

    throw new Error('linkedin_auth_missing: Provide LI_COOKIES_PATH or LI_EMAIL/LI_PASSWORD')
  }

  async _isLoggedIn() {
    try {
      await this.page.waitForURL(/linkedin\.com\/feed/, { timeout: 7000 })
      return true
    } catch { return false }
  }

  async _loginWithPassword(email, password) {
    await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
    await this.page.fill('input#username', email)
    await this.page.fill('input#password', password)
    await Promise.all([
      this.page.click('button[type="submit"]'),
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    ])
    if (!(await this._isLoggedIn())) throw new Error('linkedin_login_failed_or_challenge')
  }

  async gotoProfileByHandle(handle) {
    const h = String(handle || '').replace(/^@/, '')
    await this.page.goto(`https://www.linkedin.com/in/${h}/`, { waitUntil: 'domcontentloaded' })
    await this.page.waitForTimeout(800)
  }

  async sendMessageToHandle(handle, text) {
    await this.init()
    await pRetry(async () => {
      await this.gotoProfileByHandle(handle)
      const msgBtn = this.page.locator('button:has-text("Message")')
      if (await msgBtn.count() === 0) throw new Error('li_message_button_not_found')
      await msgBtn.first().click()
      const editor = this.page.locator('[role="textbox"]')
      await editor.waitFor({ timeout: 8000 })
      await editor.fill(text)
      await sleep(300 + Math.random()*400)
      const sendBtn = this.page.locator('button:has-text("Send")')
      await sendBtn.first().click()
      await this.page.waitForTimeout(1200)
    }, { retries: 2 })
    return { ok: true }
  }

  // Returns [{handle, text, ts}]
  async pollInbox(limit = 10) {
    await this.init()
    await this.page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded' })
    const threads = this.page.locator('[data-conversation-id]')
    await threads.first().waitFor({ timeout: 10000 }).catch(()=>{})

    const out = []
    const n = Math.min(await threads.count(), limit)
    for (let i=0; i<n; i++) {
      const row = threads.nth(i)
      await row.click()
      await this.page.waitForTimeout(600)
      const bubbles = this.page.locator('[data-artdeco-is-focused="true"] .msg-s-message-list__event')
      const lastIdx = (await bubbles.count()) - 1
      if (lastIdx < 0) continue
      const last = bubbles.nth(lastIdx)
      const text = (await last.locator('.msg-s-event-listitem__body').textContent().catch(()=>''))?.trim() || ''
      if (!text) continue
      const personLink = await this.page.locator('a.msg-thread__link-to-profile').first().getAttribute('href').catch(()=>null)
      let handle = null
      if (personLink && /linkedin\.com\/in\/([^\/?#]+)/.test(personLink)) {
        handle = decodeURIComponent(personLink.match(/linkedin\.com\/in\/([^\/?#]+)/)[1])
      }
      out.push({ handle, text, ts: Date.now() })
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