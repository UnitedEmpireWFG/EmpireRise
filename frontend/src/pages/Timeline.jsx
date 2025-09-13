// frontend/src/pages/Timeline.jsx
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function Timeline() {
  const [events, setEvents] = useState([])
  const [err, setErr] = useState("")

  async function load() {
    try {
      const data = await apiFetch("/api/lead/timeline")
      setEvents(Array.isArray(data?.items) ? data.items : [])
      setErr("")
    } catch (e) {
      setErr(e.message || "load_failed")
      setEvents([])
    }
  }

  useEffect(() => { load() }, [])

  const fmt = v => {
    try {
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? String(v || "") : d.toLocaleString()
    } catch { return String(v || "") }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Timeline</h2>
      <button className="btn" onClick={load}>Refresh</button>
      {err && <div style={{ color: "salmon", marginTop: 8 }}>Error. {err}</div>}
      <ul style={{ marginTop: 12 }}>
        {events.map(ev => (
          <li key={ev.id}>
            {fmt(ev.when)} · {(ev.kind || "event")} · {ev.note || ""}
          </li>
        ))}
      </ul>
      {events.length === 0 && !err && <div>No events yet.</div>}
    </div>
  )
}
