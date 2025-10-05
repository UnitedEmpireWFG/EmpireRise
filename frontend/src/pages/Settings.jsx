// frontend/src/pages/Settings.jsx
import { useEffect, useState, useRef, useCallback } from 'react'
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
    const tick = setInterval(() => {
      if (!win || win.closed) { clearInterval(tick); resolve() }
    }, 700)
    // extra safety: if popup posts a message, resolve early
    const listener = () => { try { if (!win || win.closed) resolve() } catch {} }
    window.addEventListener('message', listener, { once: true })
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
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef(null)
  const dropRef = useRef(null)

  async function refresh() {
    try {
      const token = await requireToken()
      const ts = Date.now()
      const r = await fetch(`${API}/api/social/status?ts=${ts}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        cache: 'no-store'
      })
      if (!r.ok) throw new Error(`status_${r.status}`)
      const j = await r.json()
      setLi(Boolean(j?.linkedin_oauth))
      setLiCookies(Boolean(j?.linkedin_cookies))
      setFb(Boolean(j?.facebook))
      setIg(Boolean(j?.instagram))
      setMsg('')
      if (j?.dbg) console.log('social_status_dbg', j.dbg)
    } catch (e) {
      setMsg(`Status check failed ${String(e?.message || e)}`)
    }
  }

  useEffect(() => { refresh() }, [])

  async function afterPopupRefresh() {
    // give backend a moment to write, then fetch twice with cache-busting
    await new Promise(r => setTimeout(r, 400))
    await refresh()
    await new Promise(r => setTimeout(r, 400))
    await refresh()
  }

  async function connectLinkedIn() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/linkedin/login?state=${encodeURIComponent(token)}`)
    await afterPopupRefresh()
  }
  async function connectFacebook() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/meta/login?platform=facebook&state=${encodeURIComponent(token)}`)
    await afterPopupRefresh()
  }
  async function connectInstagram() {
    const token = await requireToken()
    await openPopup(`${API}/oauth/meta/login?platform=instagram&state=${encodeURIComponent(token)}`)
    await afterPopupRefresh()
  }

  // ---------- LinkedIn cookies upload ----------
  const validateCookieJson = async (file) => {
    if (!file) throw new Error('no_file')
    if (file.size > 2_000_000) throw new Error('file_too_large_2mb_max')
    const text = await file.text()
    let json
    try { json = JSON.parse(text) } catch { throw new Error('invalid_json') }
    if (!Array.isArray(json)) throw new Error('expected_array_of_cookies')
    // quick sanity: each item has at least name & value
    const ok = json.every(c => typeof c?.name === 'string' && typeof c?.value === 'string')
    if (!ok) throw new Error('cookies_missing_name_or_value')
    return new Blob([JSON.stringify(json)], { type: 'application/json' })
  }

  const uploadCookiesBlob = async (blob) => {
    const token = await requireToken()
    const fd = new FormData()
    fd.append('file', blob, 'linkedin.cookies.json')
    const r = await fetch(`${API}/api/linkedin/cookies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      credentials: 'include',
    })
    if (!r.ok) throw new Error(`upload_${r.status}`)
    const j = await r.json().catch(()=>({}))
    return j
  }

  const handleFileList = async (list) => {
    if (!list || list.length === 0) return
    setUploading(true); setMsg('Uploading LinkedIn cookies…')
    try {
      const blob = await validateCookieJson(list[0])
      await uploadCookiesBlob(blob)
      setMsg('✅ LinkedIn cookies uploaded.')
      setLiCookies(true)
      await refresh()
    } catch (e) {
      setMsg(`Upload failed: ${String(e?.message || e)}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = (e) => handleFileList(e.target.files)

  const onDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const dt = e.dataTransfer
    const files = dt?.files
    if (files && files.length) handleFileList(files)
  }, [])

  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.add('drag') }
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dropRef.current?.classList.remove('drag') }

  return (
    <div style={{ padding: 24 }}>
      <h2>Social Connections</h2>

      <div style={{ marginBottom: 16 }}>
        <p>
          LinkedIn: <b>{li ? 'Connected' : 'Not connected'}</b>{' '}
          <button onClick={connectLinkedIn}>CONNECT</button>{' '}
          <button onClick={refresh} style={{ marginLeft: 8 }}>Check now</button>
        </p>
        <p>
          LinkedIn messaging cookies:{' '}
          <b>{liCookies ? 'Present' : 'Missing'}</b>
        </p>

        {/* Cookies upload controls */}
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          style={{
            marginTop: 10,
            padding: 14,
            border: '1px dashed #666',
            borderRadius: 8,
            background: '#111',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <b>Upload LinkedIn cookies (.json)</b>
          </div>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 8 }}>
            Drag & drop your exported cookies file here, or{' '}
            <button onClick={onPickFile} disabled={uploading}>choose file</button>.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Tip: Export cookies from your browser (JSON array of cookies for *.linkedin.com). Size &lt; 2MB.
          </div>
        </div>
      </div>

      <hr style={{ borderColor:'#222' }} />

      <div style={{ marginTop: 16 }}>
        <p>
          Facebook: <b>{fb ? 'Connected' : 'Not connected'}</b>{' '}
          <button onClick={connectFacebook}>CONNECT</button>
        </p>
        <p>
          Instagram: <b>{ig ? 'Connected' : 'Not connected'}</b>{' '}
          <button onClick={connectInstagram}>CONNECT</button>
        </p>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  )
}
