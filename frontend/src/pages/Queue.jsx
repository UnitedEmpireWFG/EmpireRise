import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'

export default function Queue() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  const load = async () => {
    setErr('')
    try {
      const j = await apiFetch('/api/queue?status=scheduled')
      if (!j?.ok) throw new Error(j?.error || 'failed')
      setRows(j.rows || [])
    } catch (e) { setErr(String(e.message || e)) }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <button className="btn" onClick={load}>REFRESH</button>
      {err && <span style={{ marginLeft:12, color:'salmon' }}>Error: {err}</span>}
      <div className="card" style={{ marginTop:8, minHeight:64, padding:12 }}>
        {rows.length ? `${rows.length} queued` : 'No rows.'}
      </div>
    </div>
  )
}