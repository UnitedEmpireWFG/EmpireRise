/* frontend/src/pages/Leads.jsx */
import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

// --- helpers -------------------------------------------------
function normalizeLead(raw) {
  const lead = { ...raw }
  // profile_urls might come back as a JSON string from DB—make it an object
  if (typeof lead.profile_urls === "string") {
    try { lead.profile_urls = JSON.parse(lead.profile_urls) } catch { lead.profile_urls = null }
  }
  return lead
}

function scoreLeadPair(lead) {
  const base = lead.platform === "linkedin" ? 12 : 8
  const idStrength =
    (lead.profile_urls?.linkedin ? 6 : 0) +
    (lead.handle ? 3 : 0)

  const replies     = Number(lead.replies || 0)
  const engagements = Number(lead.engagement_count || 0)
  const meetings    = Number(lead.meetings || 0)
  const bookings    = Number(lead.bookings || 0)

  const statusBump =
    lead.status === "qualified" ? 10 :
    lead.status === "booked"    ? 20 : 0

  const days = lead.created_at
    ? Math.max(1, (Date.now() - new Date(lead.created_at).getTime())/86400000)
    : 30
  const decay = Math.min(0.35, days * 0.005)

  // client intent
  let cs = base + idStrength + replies*10 + engagements*4 + meetings*16 + bookings*24 + statusBump
  cs = Math.max(0, Math.round(cs * (1 - decay)))
  const clientPct = Math.max(0, Math.min(100, cs))

  // recruit intent
  const recSignals = Number(lead.recruit_signals || 0)
  let rs = base + idStrength + replies*8 + engagements*5 + recSignals*12 + meetings*14 + statusBump
  rs = Math.max(0, Math.round(rs * (1 - decay)))
  const recruitPct = Math.max(0, Math.min(100, rs))

  return { clientPct, recruitPct }
}

function PercentCell({ value }) {
  const n = Number.isFinite(value) ? value : 0
  const tone = n>=70 ? "#25c225" : n>=50 ? "#b8d72a" : n>=30 ? "#e1c542" : "#d86a6a"
  return <td style={{ color: tone, fontWeight: 800 }}>{n}%</td>
}

// --- row -----------------------------------------------------
function LeadRow({ lead }) {
  const L = useMemo(() => normalizeLead(lead), [lead])
  const { clientPct, recruitPct } = useMemo(() => scoreLeadPair(L), [L])

  return (
    <tr>
      <td>{L.name || "-"}</td>
      <td style={{ textTransform:"capitalize" }}>{L.platform || "-"}</td>
      <td>{L.handle || "-"}</td>
      <td>{L.status || "-"}</td>
      <td>{L.thread_state || "intro"}</td>
      <PercentCell value={clientPct} />
      <PercentCell value={recruitPct} />
      <td>
        {(L.profile_urls && typeof L.profile_urls === "object")
          ? Object.entries(L.profile_urls).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{k}</a>
            ))
          : null}
      </td>
    </tr>
  )
}

// --- page ----------------------------------------------------
export default function Leads() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState("")
  const [q, setQ] = useState("")

  // quick-add strip
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [platform, setPlatform] = useState("linkedin")
  const [note, setNote] = useState("")

  const load = () => {
    apiFetch("/api/leads")
      .then(data => {
        const arr = Array.isArray(data) ? data : []
        setRows(arr)
        setErr("")
      })
      .catch(e => setErr(e.message || "load_failed"))
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    try {
      await apiFetch("/api/leads", {
        method: "POST",
        body: JSON.stringify({ name, handle, platform, note })
      })
      setName(""); setHandle(""); setNote("")
      load()
    } catch (e) {
      setErr(e.message || "save_failed")
    }
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.name || "").toLowerCase().includes(t) ||
      (r.handle || "").toLowerCase().includes(t) ||
      (r.platform || "").toLowerCase().includes(t) ||
      (r.status || "").toLowerCase().includes(t) ||
      (r.thread_state || "").toLowerCase().includes(t)
    )
  }, [rows, q])

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* quick add */}
      <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 8 }}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Handle" value={handle} onChange={e => setHandle(e.target.value)} />
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <input placeholder="Note" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn" onClick={add}>Add</button>
      </div>

      {/* tools */}
      <div className="card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={load}>Refresh</button>
        {err && <span style={{ color: "salmon" }}>Error. {err}</span>}
      </div>

      {/* table */}
      <div className="card" style={{ padding: 12, overflowX:"auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>Platform</th>
              <th style={{ textAlign: "left" }}>Handle</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Thread</th>
              <th style={{ textAlign: "left" }}>Client%</th>
              <th style={{ textAlign: "left" }}>Recruit%</th>
              <th style={{ textAlign: "left" }}>Profiles</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => <LeadRow key={l.id} lead={l} />)}
          </tbody>
        </table>
        {filtered.length === 0 && <div>No leads yet.</div>}
      </div>
    </div>
  )
}
