import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS_URL = process.env.SUPABASE_JWKS_URL; 
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF; 

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing_token" });

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${PROJECT_REF}.supabase.co/`,
    });

    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}
