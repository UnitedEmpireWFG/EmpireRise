import { makeTransport } from '../providers/email.js'

const LOG_PREFIX = '[ops_alert]'
const slackWebhook = process.env.OPS_SLACK_WEBHOOK_URL || process.env.SLACK_ALERT_WEBHOOK_URL || null
const alertEmail = process.env.OPS_ALERT_EMAIL || process.env.ALERT_EMAIL || null
const alertFrom = process.env.OPS_ALERT_FROM || process.env.SMTP_USER || null
const emailEnabled = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && alertEmail && alertFrom)
const slackEnabled = Boolean(slackWebhook)

const recentAlerts = new Map()
const DEFAULT_THROTTLE_MS = 10 * 60 * 1000
const SERIOUS_LINKEDIN_PATTERNS = [
  /linkedin_auth_missing/i,
  /message_button_not_found/i,
  /message_composer_not_found/i,
  /send_button_not_found/i,
  /connect_button_not_found/i,
  /add_note_button_not_found/i,
  /note_textarea_not_found/i,
  /linkedin_suggestions_not_found/i,
  /missing_cookies/i
]

export function isSeriousLinkedInError(message) {
  const msg = String(message || '')
  return SERIOUS_LINKEDIN_PATTERNS.some((pattern) => pattern.test(msg))
}

function shouldThrottle(key, throttleMs = DEFAULT_THROTTLE_MS) {
  if (!key || !throttleMs) return false
  const now = Date.now()
  const prev = recentAlerts.get(key) || 0
  if (now - prev < throttleMs) return true
  recentAlerts.set(key, now)
  return false
}

function formatMeta(meta) {
  if (!meta) return ''
  try {
    return JSON.stringify(meta, null, 2)
  } catch {
    return String(meta)
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function sendSlack(subject, body, metaText) {
  if (!slackEnabled) return
  try {
    const segments = [body]
    if (metaText) segments.push('```' + metaText.slice(0, 3500) + '```')
    const text = `:rotating_light: ${subject}\n${segments.filter(Boolean).join('\n')}`
    const res = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      throw new Error(`slack_notify_failed:${res.status}:${errText}`)
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} slack_failed`, error?.message || error)
  }
}

async function sendEmail(subject, body, metaText) {
  if (!emailEnabled) return
  try {
    const transport = makeTransport()
    const lines = [body]
    if (metaText) lines.push('', metaText)
    const text = lines.filter(Boolean).join('\n')
    const html = `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` +
      (metaText ? `<pre>${escapeHtml(metaText)}</pre>` : '')
    await transport.sendMail({
      from: alertFrom,
      to: alertEmail,
      subject,
      text,
      html
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} email_failed`, error?.message || error)
  }
}

export async function notifyOps(subject, body, options = {}) {
  const { meta = null, throttleKey = null, throttleMs = DEFAULT_THROTTLE_MS } = options
  const key = throttleKey || subject
  if (shouldThrottle(key, throttleMs)) {
    return false
  }

  const metaText = formatMeta(meta)
  if (!slackEnabled && !emailEnabled) {
    console.warn(`${LOG_PREFIX} no_transports_configured`, { subject, body, meta })
    return false
  }

  await Promise.all([
    sendSlack(subject, body, metaText),
    sendEmail(subject, body, metaText)
  ])
  return true
}
