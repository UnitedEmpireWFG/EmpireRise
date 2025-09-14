import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'

export default function Approvals() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setErr('')
    try {
      const j = await apiFetch('/api/approvals?status=pending&limit=200')
      if (!j?.ok) throw new Error(j?.error || 'failed')
      setRows(j.rows || [])
    } catch (e) { setErr(String(e.message || e)) }
  }

  const approveAll = async () => {
    setBusy(true)
    setErr('')
    try {
      const j = await apiFetch('/api/approvals/bulk', { method: 'POST', body: JSON.stringify({ action:'approve_all' }) })
      if (!j?.ok) throw new Error(j?.error || 'failed')
      await load()
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <button className="btn" onClick={approveAll} disabled={busy}>{busy ? 'Processing…' : 'APPROVE ALL'}</button>
        <button className="btn" onClick={load}>{busy ? 'Refreshing…' : 'REFRESH'}</button>
        {err && <span style={{ color:'salmon' }}>Error loading approvals: {err}</span>}
      </div>
      <div className="card" style={{ minHeight: 64, padding: 12 }}>
        {rows.length ? `${rows.length} pending` : 'No approvals pending.'}
      </div>
    </div>
  )
}