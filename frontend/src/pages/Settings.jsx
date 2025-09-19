// frontend/src/pages/Settings.jsx
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const API = import.meta.env.VITE_API_BASE || 'https://empirerise.onrender.com'
const supa = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

function openPopup(url) {
  const w = 600, h = 700
  const y = window.top.outerHeight / 2 + window.top.screenY - h / 2
  const x = window.top.outerWidth / 2 + window.top.screenX - w / 2
  const win = window.open(url, 'oauth_popup', `width=${w},height=${h},left=${x},top=${y}`)
  return new Promise(resolve => {
    const t = setInterval(() => { if (!win || win.closed) { clearInterval(t); resolve() } }, 700)
  })
}

async function requireToken() {
  let { data: { session } } = await supa.auth.getSession()
  if (session?.access_token) return session.access_token
  await supa.auth.refreshSession()
  ;({ data: { session } } = await supa.auth.getSession())
  if (session?.access_token) return session.access_token
  const here = window.location.href
  window.location.assign('/login?next=' + encodeURIComponent(here))
  throw new Error('redirect_login')
}

export default function Settings() {
  const [li, setLi] = useState(false)
  const [liCookies, setLiCookies] = useState(false)
  const [fb, setFb] = useState(false)
  const [ig, setIg] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const err = q.get('error')
    if (err) setMsg('OAuth error ' + err)
    refresh()
  }, [])

  async function refresh() {
    try {
      const token = await requireToken()
      const r = await fetch(`${API}/api/social/status`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      })
      if (!r.ok) throw new Error(`status_${r.status}`)
      const j = await r.json()
      setLi(Boolean(j?.linkedin_oauth))
      setLiCookies(Boolean(j?.linkedin_cookies))
      setFb(Boolean(j?.facebook))
      setIg(Boolean(j?.instagram))
      setMsg('')
    } catch (e) {
      setMsg(`Status check failed ${String(e?.message || e)}`)
    }
  }

  async function connectLinkedIn() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/linkedin/login?token=${encodeURIComponent(token)}`)
    await refresh()
  }
  async function connectFacebook() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/meta/login?platform=facebook&state=${encodeURIComponent(token)}`)
    await refresh()
  }
  async function connectInstagram() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/meta/login?platform=instagram&state=${encodeURIComponent(token)}`)
    await refresh()
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Social Connections</h2>
      <p>LinkedIn: {li ? 'Connected' : 'Not connected'} <button onClick={connectLinkedIn}>CONNECT</button></p>
      <p>LinkedIn messaging cookies: {liCookies ? 'Present' : 'Missing'}</p>
      <p>Facebook: {fb ? 'Connected' : 'Not connected'} <button onClick={connectFacebook}>CONNECT</button></p>
      <p>Instagram: {ig ? 'Connected' : 'Not connected'} <button onClick={connectInstagram}>CONNECT</button></p>
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}