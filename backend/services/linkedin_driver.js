import { chromium } from "playwright"
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)
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

  async launch() {
    console.log('Playwright launching with default Chromium')
    const browser = await chromium.launch({ headless: true })
    this.browser = browser
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


