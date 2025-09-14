import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'

const shell = {
  background: "rgba(255,215,0,0.08)",
  border: "1px solid rgba(255,215,0,0.35)",
  borderRadius: 10,
  padding: 14
}

const statCard = {
  border: "1px solid rgba(255,215,0,0.35)",
  background: "rgba(0,0,0,0.35)",
  borderRadius: 8,
  padding: 14,
  minWidth: 180
}

const statTitle = { fontSize: 12, opacity: .85, marginBottom: 6 }
const statValue = { fontSize: 24, fontWeight: 800, lineHeight: 1 }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true); setErr('')
    try {
      const j = await apiFetch('/api/dashboard')
      if (!j?.ok) throw new Error(j?.error || 'failed')
      setData(j)
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ display:"grid", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button className="btn" onClick={load} disabled={busy}>
          {busy ? 'Refreshing…' : 'REFRESH'}
        </button>
        {err && <span style={{ color:"salmon" }}>{err}</span>}
      </div>

      <div style={shell}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:12 }}>
          <Card title="Drafts"      value={data?.drafts ?? 0} />
          <Card title="Queued"      value={data?.queued ?? 0} />
          <Card title="Sent (30d)"  value={data?.sent ?? 0} />
          <Card title="Replies (30d)" value={data?.replies ?? 0} />
          <Card title="Bookings (30d)" value={data?.booked ?? 0} />
          <Card title="Qualified (30d)" value={data?.qualified ?? 0} />
        </div>
      </div>
    </div>
  )
}

function Card({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
    </div>
  )
}