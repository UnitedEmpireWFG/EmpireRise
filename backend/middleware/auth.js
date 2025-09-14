// backend/middleware/auth.js
import * as jose from "jose"

const JWKS = jose.createRemoteJWKSet(
  new URL(process.env.SUPABASE_JWKS_URL)
)

// Core middleware
export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null

  if (!token) {
    return res.status(401).json({ ok: false, error: "no_token" })
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: process.env.SUPABASE_URL + "/auth/v1",
    })

    req.user = payload
    next()
  } catch (e) {
    console.error("JWT verify failed:", e.message)
    return res.status(401).json({ ok: false, error: "unauthorized" })
  }
}

// Alias for compatibility (so requireUser also works if needed)
export const requireUser = requireAuth