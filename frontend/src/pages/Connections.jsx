// frontend/src/pages/Connections.jsx
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function Connections() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState(null)

  async function load() {
    try {
      const data = await apiFetch("/api/connections/list")
      setRows(Array.isArray(data?.items) ? data.items : [])
      setErr(null)
    } catch (e) {
      setErr(e.message)
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2>Connections</h2>
      <button onClick={load}>Refresh</button>
      {err && <div style={{ color: "tomato" }}>{err}</div>}
      <ul>
        {rows.map(c => (
          <li key={c.id}>{`${c.platform} — ${c.status}`}</li>
        ))}
      </ul>
      {rows.length === 0 && <div>No connections yet.</div>}
    </div>
  )
}
