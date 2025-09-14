import * as jose from 'jose'

const SUPABASE_URL = process.env.SUPABASE_URL
const JWKS_URL = process.env.SUPABASE_JWKS_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/,'')}/auth/v1/keys` : null)
const JWKS = JWKS_URL ? jose.createRemoteJWKSet(new URL(JWKS_URL)) : null

export async function getUserFromStateToken(token) {
  if (!token) throw new Error('missing_state')
  if (!JWKS) throw new Error('jwks_not_configured')
  const { payload } = await jose.jwtVerify(token, JWKS, { issuer: 'https://'+new URL(SUPABASE_URL).host+'/auth/v1' })
  // Supabase access token payload includes sub as the user id
  return { user_id: payload.sub, email: payload.email || null, payload }
}