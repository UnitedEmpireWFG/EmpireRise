/* frontend/src/pages/Dashboard.jsx */
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function Dashboard() {
  const [data, setData] = useState({ sent:0, replies:0, qualified:0, booked:0 })
  const [err, setErr] = useState("")

  useEffect(() => {
    (async () => {
      try {
        const j = await apiFetch('/api/dashboard')
        if (!j.ok) throw new Error(j.error || 'failed')
        setData(j)
      } catch (e) {
        setErr(String(e.message || e))
      }
    })()
  }, [])

  return (
    <div style={{ display:"grid", gap:16 }}>
      {err ? (
        <div className="card" style={{ background:"#1f5f1f", border:"1px solid #ffd700", color:"#ffd700", padding:16 }}>
          Error: {err}
        </div>
      ) : null}

      {/* four small green cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
        <StatCard title="Sent" value={data.sent} />
        <StatCard title="Replies" value={data.replies} />
        <StatCard title="Qualified" value={data.qualified} />
        <StatCard title="Booked" value={data.booked} />
      </div>

      {/* remove the big card block entirely */}
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="card" style={{
      background:"#1f5f1f",
      border:"1px solid #ffd700",
      color:"#ffd700",
      borderRadius:8,
      padding:16
    }}>
      <div style={{ fontSize:12, opacity:.85 }}>{title}</div>
      <div style={{ fontSize:28, fontWeight:800 }}>{value}</div>
    </div>
  )
}