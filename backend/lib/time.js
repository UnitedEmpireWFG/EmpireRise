export function nowInTz(tz) {
  return new Date(new Date().toLocaleString("en-CA", { timeZone: tz }))
}

export function isWithinQuietHours(tz, quiet) {
  const n = nowInTz(tz)
  const hhmm = d => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
  const cur = hhmm(n)
  const start = quiet.start || "21:00"
  const end = quiet.end || "08:00"
  if (start < end) {
    return cur >= start && cur < end
  } else {
    return cur >= start || cur < end
  }
}

export function randomSeconds(min, max) {
  const a = Math.max(1, Math.floor(min))
  const b = Math.max(a, Math.floor(max))
  return Math.floor(a + Math.random() * (b - a + 1))
}

