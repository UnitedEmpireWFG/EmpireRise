export function randomWithinWindow(windowName, baseDate = new Date()) {
  const d = new Date(baseDate);
  const startEnd = windowName === "evening" ? [18, 21] : [9, 12];  // 24h hours
  const startHour = startEnd[0];
  const endHour = startEnd[1];
  const hour = Math.floor(startHour + Math.random() * (endHour - startHour));
  const minute = Math.floor(Math.random() * 60);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
