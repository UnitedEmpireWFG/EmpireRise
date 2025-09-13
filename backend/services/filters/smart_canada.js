export function normalize(s='') { return String(s || '').toLowerCase().trim() }
export function splitList(s='') {
  return normalize(s)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
}

const CANADA_TOKENS = [
  'canada','🇨🇦',
  // common cities/regions (expand as needed)
  'toronto','mississauga','brampton','ottawa','montreal','quebec',
  'calgary','edmonton','vancouver','surrey','burnaby','victoria',
  'winnipeg','saskatoon','regina','halifax','london','hamilton',
  'waterloo','kitchener','niagara','gta','ontario','bc','british columbia','alberta','manitoba','saskatchewan','nova scotia','new brunswick','pei','prince edward island','newfoundland','labrador'
]

export function looksCanadian({ locationText='', bioText='' }) {
  const t = normalize([locationText, bioText].filter(Boolean).join(' | '))
  return CANADA_TOKENS.some(tok => t.includes(tok))
}

export function notInExcluded(metaText='', excludeTermsCsv='') {
  const t = normalize(metaText)
  const bad = splitList(excludeTermsCsv)
  return !bad.some(word => t.includes(word))
}