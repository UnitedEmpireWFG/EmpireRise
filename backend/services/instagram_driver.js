import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalize, looksCanadian, notInExcluded } from '../services/filters/smart_canada.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'
const num  = (v, d=0) => (Number(v) || d)

export class InstagramDriver {
  constructor() {
    this.headful = bool(process.env.IG_HEADFUL, false)
    this.slowMo  = num(process.env.IG_SLOW_MO_MS, 0)
  }
  async launch() {
    this.browser = await chromium.launch({ headless: !this.headful, slowMo: this.slowMo })
    this.context = await this.browser.newContext({ viewport: { width: 1420, height: 900 } })
    this.page = await this.context.newPage()
  }
  async _cookiesFromPath() {
    const p = process.env.IG_COOKIES_PATH
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
      await this.context.addCookies(cookies.map(c => ({ ...c, domain: c.domain?.startsWith('.') ? c.domain : (c.domain || '.instagram.com') })))
    }
    await this.page.goto('https://www.instagram.com/explore/people/', { waitUntil: 'domcontentloaded' })
    await wait(900)
    this.ready = true
  }

  async _cardMeta(card) {
    const handleHref = await card.locator('a[href^="/"]').first().getAttribute('href').catch(()=>null)
    const m = handleHref?.match(/^\/([^/]+)/)
    const handle = m?.[1] || null
    const subtitle = (await card.locator('span:has-text("mutual")').first().textContent().catch(()=>''))?.toLowerCase() || ''
    const mutuals = parseInt(subtitle.replace(/\D+/g,'')) || (subtitle.includes('mutual') ? 1 : 0)
    return { handle, mutuals }
  }

  async _bio(handle) {
    await this.page.goto(`https://www.instagram.com/${encodeURIComponent(handle)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)
    const bio = (await this.page.locator('header').first().textContent().catch(()=>'')) || ''
    return bio
  }

  async suggestedCanada({ limit=40, requireMutuals=true }) {
    await this.init()
    const excludeCSV = process.env.IG_EXCLUDE_TERMS || ''
    const out = []
    for (let scroll=0; scroll<10 && out.length < limit; scroll++) {
      const cards = await this.page.locator('a[href^="/"][role="link"]').all()
      for (const c of cards.slice(0, 12)) {
        const meta = await this._cardMeta(c)
        if (!meta.handle) continue
        if (requireMutuals && meta.mutuals <= 0) continue

        const bio = await this._bio(meta.handle)
        const canadian = looksCanadian({ bioText: bio })
        const clean = notInExcluded(bio, excludeCSV)
        if (!canadian || !clean) continue

        out.push({ handle: meta.handle, mutuals: meta.mutuals, bio })
        if (out.length >= limit) break
      }
      await this.page.keyboard.press('End').catch(()=>{})
      await wait(1000)
    }
    const seen = new Set()
    return out.filter(x => !seen.has(x.handle) && seen.add(x.handle))
  }

  async follow(handle) {
    await this.page.goto(`https://www.instagram.com/${encodeURIComponent(handle)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)
    const followBtn = this.page.locator('button:has-text("Follow")').first()
    if (!(await followBtn.count())) throw new Error('follow_button_not_found_or_already_following')
    await followBtn.click()
    await wait(600)
    return { ok: true }
  }

  async isFollowing(handle) {
    await this.page.goto(`https://www.instagram.com/${encodeURIComponent(handle)}/`, { waitUntil: 'domcontentloaded' })
    await wait(900)
    const following = this.page.locator('button:has-text("Following")')
    return (await following.count()) > 0
  }

  async close() {
    try { await this.page?.close() } catch {}
    try { await this.context?.close() } catch {}
    try { await this.browser?.close() } catch {}
  }
}