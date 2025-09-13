// frontend/src/pages/AuthCallback.jsx
// Handles ALL email links (password reset, magic link, etc.) for supabase-js v2
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supa } from "../lib/supa"

export default function AuthCallback() {
  const nav = useNavigate()
  const [msg, setMsg] = useState("Finishing sign-in…")

  useEffect(() => {
    (async () => {
      try {
        // If Supabase sent an error in the URL (e.g., otp_expired), show it
        const url = new URL(window.location.href)
        const errCode = url.searchParams.get("error_code")
        const errDesc = url.searchParams.get("error_description")
        if (errCode) {
          setMsg(errDesc || errCode)
          return
        }

        // v2 API — this replaces the old getSessionFromUrl()
        const { data, error } = await supa.auth.exchangeCodeForSession(window.location.href)
        if (error) {
          setMsg(error.message || "Link invalid or expired.")
          return
        }

        // If this came from a password reset, send user to set a new password
        // (we keep it simple and always redirect to reset mode)
        nav("/login?mode=reset", { replace: true })
      } catch (e) {
        setMsg(String(e?.message || e) || "Auth error")
      }
    })()
  }, [nav])

  return (
    <div style={{ padding:24 }}>
      <h2>Auth</h2>
      <div>{msg}</div>
    </div>
  )
}
