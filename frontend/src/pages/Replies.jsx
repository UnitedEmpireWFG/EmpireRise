// frontend/src/pages/Replies.jsx
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function Replies() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState("")

  async function load() {
    try {
      const data = await apiFetch("/api/replies/list")
      setRows(Array.isArray(data?.items) ? data.items : [])
      setErr("")
    } catch (e) {
      setErr(e.message || "Failed to load replies")
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2>Replies</h2>
      <button className="btn" onClick={load}>Refresh</button>
      {err && <div style={{ color: "salmon" }}>{err}</div>}
      <ul>
        {rows.map(x => (
          <li key={x.id}>
            {(x.platform || "unknown").toUpperCase()} — {x.preview || "(no preview)"}
          </li>
        ))}
      </ul>
      {rows.length === 0 && !err && <div>No replies yet.</div>}
    </div>
  )
}
