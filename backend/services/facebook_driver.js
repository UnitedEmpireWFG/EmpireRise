import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)

export class FacebookDriver {
  constructor() {
    this.headful = bool(process.env.FB_HEADFUL, false)
    this.slowMo  = num(process.env.FB_SLOW_MO_MS, 0)
  }
  async launch() {
    console.log('Playwright launching with default Chromium')
    this.browser = await chromium.launch({ headless: true })
    this.context = await this.browser.newContext({ viewport: { width: 1420, height: 900 } })
    this.page = await this.context.newPage()
  }
  async _cookiesFromPath() {
    const p = process.env.FB_COOKIES_PATH
    if (!p) return null
    try {
      const raw = await fs.readFile(path.resolve(p), 'utf-8')
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : null
    } catch { return null }
  }
  async init() {
    if (this.ready) return
    if (!this.browser) await this.launch()
    const cookies = await this._cookiesFromPath()
    if (cookies) {
      await this.context.addCookies(cookies.map(c => ({ ...c, domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.facebook.com') })))
    }
    await this.page.goto('https://www.facebook.com/friends/suggestions/', { waitUntil: 'domcontentloaded' })
    await wait(900)
    this.ready = true
  }

  async _readCardMeta(card) {
    const href = await card.locator('a[href^="https://www.facebook.com/"]').first().getAttribute('href').catch(()=>null)
    const m = href?.match(/^https:\/\/www\.facebook\.com\/([^/?#]+)/)
    const handle = m?.[1] || null
    const name = (await card.locator('strong a[role="link"]').first().textContent().catch(()=>''))?.trim() || ''
    const mutualTxt = (await card.locator(':scope :text("mutual")').first().textContent().catch(()=>''))?.trim().toLowerCase() || ''
    const mutuals = parseInt(mutualTxt.replace(/\D+/g,'')) || (mutualTxt ? 1 : 0)
    return { handle, name, mutuals }
  }

  async _peekLocationAndBio(handle) {
    // Very shallow peek: open profile, read intro column text
    await this.page.goto(`https://www.facebook.com/${encodeURIComponent(handle)}`, { waitUntil: 'domcontentloaded' })
    await wait(1000)
    const intro = (await this.page.locator('[data-pagelet*="ProfileTilesFeed"], [role="main"]').first().textContent().catch(()=>'')) || ''
    return { locationText: intro, bioText: intro }
  }

  async suggestedCanada({ limit=40, requireMutuals=true }) {
    await this.init()
    const excludeCSV = process.env.FB_EXCLUDE_TERMS || ''
    const out = []
    for (let scroll=0; scroll<12 && out.length < limit; scroll++) {
      const cards = await this.page.locator('[role="feed"] [role="article"]').all()
      for (const c of cards) {
        const meta = await this._readCardMeta(c)
        if (!meta.handle) continue
        if (requireMutuals && meta.mutuals <= 0) continue

        const peek = await this._peekLocationAndBio(meta.handle)
        const canadian = looksCanadian(peek)
        const clean = notInExcluded([meta.name, peek.locationText].join(' | '), excludeCSV)
        if (!canadian || !clean) continue

        out.push({ handle: meta.handle, mutuals: meta.mutuals })
        if (out.length >= limit) break
      }
      await this.page.keyboard.press('End').catch(()=>{})
      await wait(1200)
    }
    // Sort by mutuals desc
    out.sort((a,b) => (b.mutuals||0) - (a.mutuals||0))
    // Dedup
    const seen = new Set()
    return out.filter(x => !seen.has(x.handle) && seen.add(x.handle))
  }

  async sendFriendRequest(handle) {
    await this.page.goto(`https://www.facebook.com/${encodeURIComponent(handle)}`, { waitUntil: 'domcontentloaded' })
    await wait(800)
    const addBtn = this.page.locator('div[role="button"]:has-text("Add friend")').first()
    if (!(await addBtn.count())) throw new Error('add_friend_not_found')
    await addBtn.click().catch(()=>{})
    await wait(600)
    return { ok: true }
  }

  async isFriend(handle) {
    await this.page.goto(`https://www.facebook.com/${encodeURIComponent(handle)}`, { waitUntil: 'domcontentloaded' })
    await wait(900)
    const friendsBtn = this.page.locator('div[role="button"]:has-text("Friends")')
    return (await friendsBtn.count()) > 0
  }

  async close() {
    try { await this.page?.close() } catch {}
    try { await this.context?.close() } catch {}
    try { await this.browser?.close() } catch {}
  }
}