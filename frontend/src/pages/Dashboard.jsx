import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    setErr('')
    try {
      const j = await apiFetch('/api/dashboard')
      if (!j?.ok) throw new Error(j?.error || 'failed')
      setData(j)
    } catch (e) {
      setErr(String(e.message || e))
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button className="btn" onClick={load}>Refresh</button>
        {err && <span style={{ marginLeft: 12, color: 'salmon' }}>{err}</span>}
      </div>
      <div className="grid-4">
        <Stat title="Drafts" value={data?.drafts ?? 0} />
        <Stat title="Queued" value={data?.queued ?? 0} />
        <Stat title="Sent (30d)" value={data?.sent ?? 0} />
        <Stat title="Replies (30d)" value={data?.replies ?? 0} />
        <Stat title="Qualified (30d)" value={data?.qualified ?? 0} />
        <Stat title="Bookings (30d)" value={data?.booked ?? 0} />
      </div>
    </div>
  )
}
function Stat({ title, value }) {
  return (
    <div className="card stat">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}