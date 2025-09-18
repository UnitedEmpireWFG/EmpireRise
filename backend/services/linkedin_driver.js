import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)

export class LinkedInSmart {
  constructor(opts = {}) {
    this.headful = bool(process.env.LI_HEADFUL, false)
    this.slowMo  = num(process.env.LI_SLOW_MO_MS, 0)
    this.browser = null
    this.context = null
    this.page = null
    this.ready = false
    this.opts = opts   // { cookiesPath?: string }
  }

  async launch() {
    this.browser = await chromium.launch({ headless: !this.headful, slowMo: this.slowMo })
    this.context = await this.browser.newContext({ viewport: { width: 1420, height: 900 } })
    this.page = await this.context.newPage()
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

  async init() {
    if (this.ready) return
    if (!this.browser) await this.launch()

    // Try per-user cookies first
    const perUserCookies = await this._cookiesFromPath(this.opts.cookiesPath)
    if (perUserCookies) {
      await this.context.addCookies(perUserCookies.map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
      })))
      await this.page.goto('https://www.linkedin.com/mynetwork/', { waitUntil: 'domcontentloaded' })
      if (await this._isLoggedIn()) { this.ready = true; return }
    }

    // Fallback to global cookies
    const cookies = await this._cookiesFromPath()
    if (cookies) {
      await this.context.addCookies(cookies.map(c => ({
        ...c,
        domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.linkedin.com')
      })))
      await this.page.goto('https://www.linkedin.com/mynetwork/', { waitUntil: 'domcontentloaded' })
      if (await this._isLoggedIn()) { this.ready = true; return }
    }

    throw new Error('linkedin_auth_missing')
  }

  async _extractProfileMetaFromCard(card) {
    const link = await card.locator('a[href*="/in/"]').first().getAttribute('href').catch(()=>null)
    const match = link?.match(/linkedin\.com\/in\/([^\/?#]+)/)
    const handle = match ? decodeURIComponent(match[1]) : null

    const name = (await card.locator('[data-test-reusable-connection-suggestion-full-name]').first().textContent().catch(()=>''))?.trim() || ''
    const headline = (await card.locator('[data-test-reusable-connection-suggestion-headline]').first().textContent().catch(()=>''))?.trim() || ''
    const location = (await card.locator('[data-test-reusable-connection-suggestion-subdescription]').first().textContent().catch(()=>''))?.trim() || ''
    const openBadge = await card.locator('span:has-text("Open to work")').count().catch(()=>0)

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
    for (let scroll=0; scroll<8 && out.length < limit; scroll++) {
      const cards = await this.page.locator('[data-test-reusable-connection-suggestion-card]').all()
      for (const card of cards) {
        const meta = await this._extractProfileMetaFromCard(card)
        if (!meta.handle) continue

        const canadian = looksCanadian({ locationText: meta.location })
        const clean    = notInExcluded([meta.headline, meta.location].join(' | '), excludeCSV)

        if (!canadian || !clean) continue
        out.push(meta)
        if (out.length >= limit) break
      }

      await this.page.keyboard.press('End').catch(()=>{})
      await wait(1200)
    }

    out.sort((a,b) => (b.open_to_work === true) - (a.open_to_work === true))
    const seen = new Set()
    return out.filter(x => !seen.has(x.handle) && seen.add(x.handle))
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

  async close() {
    try { await this.page?.close() } catch {}
    try { await this.context?.close() } catch {}
    try { await this.browser?.close() } catch {}
  }
}


