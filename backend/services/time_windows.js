import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import tz from 'dayjs/plugin/timezone.js'
dayjs.extend(utc); dayjs.extend(tz)

const bool = (v, d=false) => String(v ?? d).toLowerCase() === 'true'

const cfg = {
  tz: process.env.WORK_TZ || 'America/Toronto',
  days: (process.env.WORK_DAYS || '1,2,3,4,5').split(',').map(s=>+s.trim()).filter(n=>n>=0 && n<=6),
  start: process.env.WORK_START || '09:00',
  end: process.env.WORK_END || '18:00',
  quietEnabled: bool(process.env.QUIET_HOURS_ENABLED, true),

  allowPollOutside: bool(process.env.ALLOW_POLL_OUTSIDE_HOURS, true),
  allowDiscoveryOutside: bool(process.env.ALLOW_DISCOVERY_OUTSIDE_HOURS, true),
  allowDraftOutside: bool(process.env.ALLOW_DRAFTING_OUTSIDE_HOURS, true),
  allowEnqueueOutside: bool(process.env.ALLOW_ENQUEUE_OUTSIDE_HOURS, false),
}

function nowLocal() { return dayjs().tz(cfg.tz) }

export function isWithinWorkWindow() {
  if (!cfg.quietEnabled) return true
  const n = nowLocal()
  if (!cfg.days.includes(n.day())) return false
  const [sh, sm] = cfg.start.split(':').map(Number)
  const [eh, em] = cfg.end.split(':').map(Number)
  const start = n.hour(sh).minute(sm).second(0).millisecond(0)
  const end   = n.hour(eh).minute(em).second(0).millisecond(0)
  return n.isAfter(start) && n.isBefore(end)
}

export const timePolicy = {
  // SAFE to run 24/7?
  canDiscoverNow() {
    return cfg.allowDiscoveryOutside ? true : isWithinWorkWindow()
  },
  canDraftNow() {
    return cfg.allowDraftOutside ? true : isWithinWorkWindow()
  },
  // ACTIVE actions (rate-limited to work hours)
  canSendNow() {
    return isWithinWorkWindow()
  },
  canConnectNow() {
    return isWithinWorkWindow()
  },
  canAutoEnqueueNow() {
    return cfg.allowEnqueueOutside ? true : isWithinWorkWindow()
  },
  // Polling is usually safe to keep on
  canPollNow() {
    return cfg.allowPollOutside ? true : isWithinWorkWindow()
  },
  // For logging/diagnostics
  _cfg: cfg
}