import { supa } from "./supa"

/**
 * Returns a safe redirect base:
 * - NETLIFY-provided env at build time if present (recommended)
 * - otherwise window.location.origin at runtime
 */
export function getAppOrigin() {
  // Built-time env (configure in Netlify UI → Env vars)
  const fromEnv = import.meta.env.VITE_SITE_URL || import.meta.env.VITE_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  // Fallback: current origin
  return window.location.origin.replace(/\/+$/, "")
}

/**
 * Send magic link
 */
export async function sendMagicLink(email) {
  const redirectTo = `${getAppOrigin()}/auth/callback`
  return await supa.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  })
}

/**
 * Handle the callback after clicking the email link
 * Supabase v2: use exchangeCodeForSession when the URL carries 'code' params
 */
export async function handleAuthCallback() {
  // If this is an email link with 'code' in the URL, exchange it for a session:
  const { data, error } = await supa.auth.exchangeCodeForSession(window.location.href)
  return { data, error }
}
