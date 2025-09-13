// frontend/src/pages/Queue.jsx
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

function Row({ q, onAction }) {
  return (
    <div className="card" style={{ padding: 10, display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, opacity: .8 }}>Platform</div>
        <div style={{ fontWeight: 800 }}>{(q.platform || "").toUpperCase()}</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Status</div>
        <div>{q.status}</div>
      </div>
      <div>
        <div style={{ fontSize: 12, opacity: .8 }}>Message</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{q.text || q.message || q.content || ""}</div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
        {q.platform === "linkedin"
          ? <button className="btn" onClick={() => onAction(q, "approve")}>Approve</button>
          : <button className="btn" onClick={() => onAction(q, "send")}>Send now</button>}
      </div>
    </div>
  )
}

export default function Queue() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState("scheduled")
  const [err, setErr] = useState("")

  const load = () => {
    apiFetch(`/api/queue?status=${encodeURIComponent(filter)}`)
      .then(data => { setRows(Array.isArray(data) ? data : []); setErr("") })
      .catch(e => setErr(e.message || "load_failed"))
  }

  useEffect(() => { load() }, [filter])

  const onAction = async (q, action) => {
    try {
      if (action === "approve") {
        await apiFetch(`/api/queue/${q.id}/approve`, { method: "POST" })
      } else if (action === "send") {
        await apiFetch(`/api/queue/${q.id}/send`, { method: "POST" })
      }
      load()
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="scheduled">Scheduled</option>
          <option value="ready">Ready</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="error">Error</option>
        </select>
        <button className="btn" onClick={load}>Refresh</button>
        {err && <span style={{ color: "salmon" }}>Error. {err}</span>}
      </div>
      {rows.length === 0 ? <div>No rows.</div> : rows.map(r => <Row key={r.id} q={r} onAction={onAction} />)}
    </div>
  )
}
