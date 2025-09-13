// frontend/src/pages/AssistLIBatch.jsx
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function AssistLIBatch() {
  const [prefs, setPrefs] = useState({
    is_enabled: false,
    daily_quota: 25,
    schedule_cron: "0 9 * * *",
    timezone: "America/Edmonton",
    mode: "push"
  })
  const [msg, setMsg] = useState("")

  useEffect(() => {
    apiFetch("/api/li/batch/prefs")
      .then(d => {
        if (d && Object.keys(d).length) {
          setPrefs(p => ({ ...p, ...d }))
        }
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    try {
      await apiFetch("/api/li/batch/prefs", {
        method: "POST",
        body: JSON.stringify({ user_id: null, ...prefs })
      })
      setMsg("Saved.")
    } catch (e) {
      setMsg("Save failed: " + (e.message || "unknown"))
    } finally {
      setTimeout(() => setMsg(""), 1500)
    }
  }

  const bulkApprove = async () => {
    try {
      await apiFetch("/api/queue/bulk_approve", {
        method: "POST",
        body: JSON.stringify({ network: "linkedin", filter: "ready" })
      })
      alert("Approved.")
    } catch (e) {
      alert("Failed: " + e.message)
    }
  }

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 10, maxWidth: 560 }}>
      <div style={{ fontWeight: 800 }}>LinkedIn Daily Batch</div>
      <label>
        <input
          type="checkbox"
          checked={prefs.is_enabled}
          onChange={e => setPrefs({ ...prefs, is_enabled: e.target.checked })}
        /> Enabled
      </label>
      <label>
        Daily quota
        <input
          type="number"
          value={prefs.daily_quota}
          onChange={e => setPrefs({ ...prefs, daily_quota: Number(e.target.value) })}
        />
      </label>
      <label>
        Cron
        <input
          value={prefs.schedule_cron}
          onChange={e => setPrefs({ ...prefs, schedule_cron: e.target.value })}
        />
      </label>
      <label>
        Timezone
        <input
          value={prefs.timezone}
          onChange={e => setPrefs({ ...prefs, timezone: e.target.value })}
        />
      </label>
      <label>
        Mode
        <select
          value={prefs.mode}
          onChange={e => setPrefs({ ...prefs, mode: e.target.value })}
        >
          <option value="push">Push to phone</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn" onClick={bulkApprove}>Approve LinkedIn Queue</button>
        {msg && <span>{msg}</span>}
      </div>
    </div>
  )
}
