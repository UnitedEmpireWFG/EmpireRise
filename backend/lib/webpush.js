import webpush from "web-push"

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ""
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ""
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export async function sendWebPush(subscription, payload) {
  const sub = subscription?.endpoint ? subscription : subscription?.raw ? subscription.raw : null
  if (!sub?.endpoint) return { ok: false, error: "invalid_subscription" }
  const data = typeof payload === "string" ? payload : JSON.stringify(payload)
  try {
    await webpush.sendNotification(sub, data)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export default { send: sendWebPush }