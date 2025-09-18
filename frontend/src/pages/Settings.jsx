import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_BASE || 'https://empirerise.onrender.com'

function openPopup(url) {
  const w = 600, h = 700
  const y = window.top.outerHeight / 2 + window.top.screenY - h / 2
  const x = window.top.outerWidth / 2 + window.top.screenX - w / 2
  const win = window.open(url, 'oauth_popup', `width=${w},height=${h},left=${x},top=${y}`)
  return new Promise(resolve => {
    const timer = setInterval(() => {
      if (!win || win.closed) { clearInterval(timer); resolve() }
    }, 700)
  })
}

export default function Settings() {
  const [liConnected, setLiConnected] = useState(false)
  const [fbConnected, setFbConnected] = useState(false)
  const [igConnected, setIgConnected] = useState(false)

  async function refresh() {
    try {
      const r = await fetch(`${API}/api/app-settings/me`, { credentials: 'include' })
      const j = await r.json()
      setLiConnected(Boolean(j?.linkedin_access_token))
      setFbConnected(Boolean(j?.meta_access_token))
      setIgConnected(Boolean(j?.instagram_access_token))
    } catch {}
  }

  useEffect(() => { refresh() }, [])

  async function connectLinkedIn() {
    const state = localStorage.getItem('sb-access-token') || ''
    await openPopup(`${API}/oauth/linkedin/login?state=${encodeURIComponent(state)}`)
    await refresh()
  }
  async function connectFacebook() {
    const state = localStorage.getItem('sb-access-token') || ''
    await openPopup(`${API}/oauth/meta/login?platform=facebook&state=${encodeURIComponent(state)}`)
    await refresh()
  }
  async function connectInstagram() {
    const state = localStorage.getItem('sb-access-token') || ''
    await openPopup(`${API}/oauth/meta/login?platform=instagram&state=${encodeURIComponent(state)}`)
    await refresh()
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Social Connections</h2>
      <p>LinkedIn: {liConnected ? 'Connected' : 'Not connected'} <button onClick={connectLinkedIn}>Connect</button></p>
      <p>Facebook: {fbConnected ? 'Connected' : 'Not connected'} <button onClick={connectFacebook}>Connect</button></p>
      <p>Instagram: {igConnected ? 'Connected' : 'Not connected'} <button onClick={connectInstagram}>Connect</button></p>
    </div>
  )
}