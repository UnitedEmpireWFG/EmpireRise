/* frontend/src/pages/Prospects.jsx */
import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "../lib/apiFetch"

function Row({ p, selected, onToggle, onDnc, onConvert, onSave, onConnect }) {
  const [edit, setEdit] = useState(false)
  const [note, setNote] = useState(p.note || "")

  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} onChange={() => onToggle(p.id)} />
      </td>
      <td>{p.name || "-"}</td>
      <td>{p.platform || "-"}</td>
      <td>{p.handle || "-"}</td>
      <td>{p.status || "-"}</td>
      <td>{p.dnc ? "DNC" : ""}</td>
      <td>
        {(p.profile_urls && typeof p.profile_urls === "object")
          ? Object.entries(p.profile_urls).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{k}</a>
            ))
          : null}
      </td>
      <td style={{ minWidth: 280 }}>
        {!edit ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => onConvert(p)}>To Lead</button>
            <button className="btn" onClick={() => onConnect([p])}>Connect</button>
            <button className="btn" onClick={() => onDnc(p)} style={{ background: "none", borderColor: "rgba(255,215,0,.35)" }}>DNC</button>
            <button className="btn" onClick={() => setEdit(true)}>Notes</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add context" />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={() => { onSave(p.id, { note }); setEdit(false) }}>Save</button>
              <button className="btn" onClick={() => { setNote(p.note || ""); setEdit(false) }} style={{ background: "none", borderColor: "rgba(255,215,0,.35)" }}>Cancel</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

export default function Prospects() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState("")
  const [viewDnc, setViewDnc] = useState(false)

  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [platform, setPlatform] = useState("linkedin")
  const [note, setNote] = useState("")

  const [selected, setSelected] = useState({})

  const load = () => {
    const url = viewDnc ? "/api/prospects/list/dnc" : "/api/prospects"
    apiFetch(url)
      .then(data => {
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.prospects)
            ? data.prospects
            : []
        setRows(arr)
        setErr("")
        setSelected({})
      })
      .catch(e => setErr(e.message || "load_failed"))
  }

  useEffect(() => { load() }, [viewDnc])

  const add = async () => {
    try {
      const resp = await apiFetch("/api/prospects", {
        method: "POST",
        body: JSON.stringify({ name, handle, platform, note })
      })
      if (resp?.error) throw new Error(resp.error)
      setName("")
      setHandle("")
      setNote("")
      load()
    } catch (e) {
      setErr(e?.message || "add_failed")
    }
  }

  const toLead = async p => {
    try {
      await apiFetch("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: p.name,
          handle: p.handle,
          platform: p.platform,
          profile_urls: p.profile_urls,
          note: p.note,
          source: "prospects"
        })
      })
      const resp = await apiFetch(`/api/prospects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "converted" })
      })
      if (resp?.error) throw new Error(resp.error)
      load()
    } catch (e) {
      setErr(e?.message || "convert_failed")
    }
  }

  const dnc = async p => {
    try {
      const resp = await apiFetch(`/api/prospects/${p.id}/dnc`, {
        method: "POST",
        body: JSON.stringify({ reason: "manual" })
      })
      if (resp?.error) throw new Error(resp.error)
      load()
    } catch (e) {
      setErr(e?.message || "dnc_failed")
    }
  }

  const save = async (id, fields) => {
    try {
      const resp = await apiFetch(`/api/prospects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields)
      })
      if (resp?.error) throw new Error(resp.error)
      load()
    } catch (e) {
      setErr(e?.message || "save_failed")
    }
  }

  const toggle = id => {
    setSelected(s => ({ ...s, [id]: !s[id] }))
  }

  const allVisibleIds = rows.map(r => r.id)
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every(id => selected[id])

  const toggleAll = () => {
    if (allChecked) {
      setSelected({})
    } else {
      const next = {}
      for (const id of allVisibleIds) next[id] = true
      setSelected(next)
    }
  }

  const connectSelected = async rowsToSend => {
    const items = rowsToSend.map(x => ({
      platform: x.platform,
      handle: x.handle,
      profile_url: x.profile_urls?.linkedin || x.profile_urls?.instagram || x.profile_urls?.facebook || "",
      note: x.note || ""
    }))
    if (items.length === 0) return
    try {
      const resp = await apiFetch("/api/growth/connect", {
        method: "POST",
        body: JSON.stringify({ items })
      })
      if (resp?.error) throw new Error(resp.error)
      alert("Queued connection requests")
    } catch (e) {
      setErr(e?.message || "connect_failed")
    }
  }

  const selectedRows = rows.filter(r => selected[r.id])

  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.name || "").toLowerCase().includes(t) ||
      (r.handle || "").toLowerCase().includes(t) ||
      (r.platform || "").toLowerCase().includes(t) ||
      (r.note || "").toLowerCase().includes(t)
    )
  }, [rows, q])

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 8, maxWidth: 920 }}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Handle" value={handle} onChange={e => setHandle(e.target.value)} />
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <input placeholder="Notes" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn" onClick={add}>Add</button>
      </div>

      <div className="card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={() => setViewDnc(v => !v)}>{viewDnc ? "Show Prospects" : "Show DNC"}</button>
        <button className="btn" onClick={load}>Refresh</button>
        <button className="btn" onClick={() => connectSelected(selectedRows)} disabled={selectedRows.length === 0}>
          Connect selected
        </button>
        {err && <span style={{ color: "salmon" }}>Error. {err}</span>}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>Platform</th>
              <th style={{ textAlign: "left" }}>Handle</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>DNC</th>
              <th style={{ textAlign: "left" }}>Profiles</th>
              <th style={{ textAlign: "left" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <Row
                key={p.id}
                p={p}
                selected={!!selected[p.id]}
                onToggle={toggle}
                onDnc={dnc}
                onConvert={toLead}
                onSave={save}
                onConnect={connectSelected}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div>No prospects yet</div>}
      </div>
    </div>
  )
}
