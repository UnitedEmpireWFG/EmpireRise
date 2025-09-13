import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
dayjs.extend(utc); dayjs.extend(timezone)

export function jitterMs(baseMs = 1200, spread = 0.5) {
  const delta = baseMs * spread
  const rnd = (Math.random() * 2 - 1) * delta
  return Math.max(0, Math.floor(baseMs + rnd))
}

export async function typePause(text = '') {
  const words = Math.max(5, String(text).split(/\s+/).filter(Boolean).length)
  const base = Math.min(2500, 160 + words * 160)
  await sleep(jitterMs(base, 0.6))
}

export function withinHumanWindow(tz = 'America/Edmonton') {
  const h = dayjs().tz(tz).hour()
  return h >= 7 && h <= 21
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
