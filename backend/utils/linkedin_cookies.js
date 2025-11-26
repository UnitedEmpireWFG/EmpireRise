import path from 'path'

const LINKEDIN_COOKIES_DIR = path.join(process.cwd(), '.data', 'li_cookies')

export function getLinkedInCookiePath(userId) {
  return path.join(LINKEDIN_COOKIES_DIR, `${userId}.json`)
}

export function getLinkedInCookiesDir() {
  return LINKEDIN_COOKIES_DIR
}
