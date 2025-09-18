// frontend/src/pages/Settings.jsx
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const API = import.meta.env.VITE_API_BASE || 'https://empirerise.onrender.com'
const supa = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
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

async function getAccessToken() {
  const { data: { session } } = await supa.auth.getSession()
  return session?.access_token || ''
}

export default function Settings() {
  const [li, setLi] = useState(false)
  const [fb, setFb] = useState(false)
  const [ig, setIg] = useState(false)
  const [msg, setMsg] = useState('')

  async function refresh() {
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('no_token')
      const r = await fetch(`${API}/api/app-settings/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      })
      if (!r.ok) throw new Error(`status_${r.status}`)
      const j = await r.json()
      setLi(Boolean(j?.linkedin_access_token))
      setFb(Boolean(j?.meta_access_token))
      setIg(Boolean(j?.instagram_access_token))
      setMsg('')
    } catch (e) {
      setMsg(`Status check failed ${String(e?.message || e)}`)
    }
  }

  useEffect(() => { refresh() }, [])

  async function connectLinkedIn() {
    const token = await getAccessToken()
    await openPopup(`${API}/oauth/linkedin/login?state=${encodeURIComponent(token)}`)
    await refresh()
  }
  async function connectFacebook() {
    const token = await getAccessToken()
    await openPopup(`${API}/oauth/meta/login?platform=facebook&state=${encodeURIComponent(token)}`)
    await refresh()
  }
  async function connectInstagram() {
    const token = await getAccessToken()
    await openPopup(`${API}/oauth/meta/login?platform=instagram&state=${encodeURIComponent(token)}`)
    await refresh()
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Social Connections</h2>
      <p>LinkedIn: {li ? 'Connected' : 'Not connected'} <button onClick={connectLinkedIn}>Connect</button></p>
      <p>Facebook: {fb ? 'Connected' : 'Not connected'} <button onClick={connectFacebook}>Connect</button></p>
      <p>Instagram: {ig ? 'Connected' : 'Not connected'} <button onClick={connectInstagram}>Connect</button></p>
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}