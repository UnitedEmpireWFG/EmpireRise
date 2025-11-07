/* frontend/src/pages/Dashboard.jsx */
import { useEffect, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function Dashboard() {
  const [data, setData] = useState({ sent:0, replies:0, qualified:0, booked:0 })
  const [err, setErr] = useState("")
  const [pipeline, setPipeline] = useState({ stats:{}, candidates:[], queue:[], log:[], fetchedAt:null })
  const [pipelineErr, setPipelineErr] = useState("")
  const [pipelineLoading, setPipelineLoading] = useState(true)

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

  useEffect(() => {
    let cancelled = false
    let timer = null

    const load = async () => {
      try {
        const resp = await apiFetch('/api/linkedin/pipeline')
        if (!resp?.ok) throw new Error(resp?.error || 'failed')
        if (!cancelled) {
          setPipeline({
            stats: resp.stats || {},
            candidates: resp.candidates || [],
            queue: resp.queue || [],
            log: resp.log || [],
            fetchedAt: Date.now()
          })
          setPipelineErr("")
          setPipelineLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setPipelineErr(String(e?.message || e) || 'failed')
          setPipelineLoading(false)
        }
      }
    }

    load()
    timer = setInterval(load, 15000)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
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

      <LinkedInLivePanel pipeline={pipeline} loading={pipelineLoading} error={pipelineErr} />
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

function LinkedInLivePanel({ pipeline, loading, error }) {
  const statsOrder = [
    { key: 'new', label: 'Sourced' },
    { key: 'requested', label: 'Requests Sent' },
    { key: 'connected', label: 'Connected' },
    { key: 'queued', label: 'Queued' },
    { key: 'error', label: 'Errors' }
  ]

  const stats = pipeline?.stats || {}
  const leads = (pipeline?.candidates || []).slice(0, 10)
  const queue = (pipeline?.queue || []).slice(0, 6)
  const log = (pipeline?.log || []).slice(0, 8)
  const updatedLabel = pipeline?.fetchedAt ? `Updated ${formatRelative(pipeline.fetchedAt)}` : ''

  return (
    <div className="card" style={{
      background: "#102d10",
      border: "1px solid #ffd700",
      color: "#ffd700",
      borderRadius: 8,
      padding: 16,
      display: "grid",
      gap: 16
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>LinkedIn Live Pipeline</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Refreshing…" : updatedLabel}</div>
      </div>

      {error ? (
        <div style={{ background: "rgba(255, 215, 0, 0.15)", border: "1px solid rgba(255, 215, 0, 0.4)", padding: 12, borderRadius: 6 }}>
          Error loading LinkedIn activity: {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {statsOrder.map(s => (
          <div key={s.key} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats[s.key] ?? 0}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Newest Leads</div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid rgba(255,215,0,0.25)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,215,0,0.08)" }}>
                  <th style={tableHeadCell}>Handle</th>
                  <th style={tableHeadCell}>Headline / Location</th>
                  <th style={tableHeadCell}>Status</th>
                  <th style={tableHeadCell}>Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>
                      {loading ? "Waiting for activity…" : "No leads yet"}
                    </td>
                  </tr>
                ) : leads.map(item => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(255,215,0,0.1)" }}>
                    <td style={tableCell}>{item.handle || "—"}</td>
                    <td style={{ ...tableCell, maxWidth: 220 }}>
                      <div>{item.headline || "—"}</div>
                      <div style={{ opacity: 0.7 }}>{item.location || ""}</div>
                      {item.open_to_work ? (
                        <div style={{ color: "#8fff8f", fontSize: 11 }}>Open to work</div>
                      ) : null}
                    </td>
                    <td style={tableCell}>{formatStatus(item.status)}</td>
                    <td style={tableCell}>{formatRelative(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Outreach Queue</div>
            <div style={{ border: "1px solid rgba(255,215,0,0.25)", borderRadius: 6, padding: 12, minHeight: 140 }}>
              {queue.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Loading queue…" : "Queue is empty"}</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                  {queue.map(item => (
                    <li key={item.id} style={{ borderBottom: "1px solid rgba(255,215,0,0.15)", paddingBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{item.handle || "—"}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{formatStatus(item.status)}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Scheduled {formatShort(item.scheduled_at || item.created_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Recent Outreach Events</div>
            <div style={{ border: "1px solid rgba(255,215,0,0.25)", borderRadius: 6, padding: 12, minHeight: 140 }}>
              {log.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{loading ? "Collecting events…" : "No recent activity"}</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                  {log.map(entry => (
                    <li key={entry.id} style={{ borderBottom: "1px solid rgba(255,215,0,0.15)", paddingBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{entry.handle || "—"}</div>
                      <div style={{ fontSize: 12 }}>{formatStatus(entry.action)}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{formatRelative(entry.created_at)}</div>
                      {entry.error ? (
                        <div style={{ fontSize: 12, color: "#ffbbbb" }}>Error: {entry.error}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const tableHeadCell = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.02em'
}

const tableCell = {
  padding: '8px 10px',
  verticalAlign: 'top'
}

function formatStatus(status) {
  if (!status) return '—'
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatRelative(value) {
  if (!value) return '—'
  const ts = typeof value === 'number' ? value : Date.parse(value)
  if (!ts || Number.isNaN(ts)) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`
  return new Date(ts).toLocaleDateString()
}

function formatShort(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

