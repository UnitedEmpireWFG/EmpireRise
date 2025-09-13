// frontend/src/pages/Approvals.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";

export default function Approvals() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const r = await apiFetch("/api/approvals?status=pending&limit=200");
      setRows(Array.isArray(r?.items) ? r.items : []);
      setMsg("");
    } catch (e) {
      setMsg("Error loading approvals: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function approve(id) {
    try {
      await apiFetch(`/api/approvals/${id}/approve`, { method: "POST" });
      setRows((x) => x.filter((r) => r.id !== id));
      setMsg("Approved.");
    } catch (e) {
      setMsg("Approve failed: " + e.message);
    }
  }

  async function reject(id) {
    try {
      await apiFetch(`/api/approvals/${id}/reject`, { method: "POST" });
      setRows((x) => x.filter((r) => r.id !== id));
      setMsg("Rejected.");
    } catch (e) {
      setMsg("Reject failed: " + e.message);
    }
  }

  async function approveAll() {
    try {
      await apiFetch("/api/approvals/bulk_approve", {
        method: "POST",
        body: JSON.stringify({ scope: "all" })
      });
      setRows([]);
      setMsg("All approved.");
    } catch (e) {
      setMsg("Approve all failed: " + e.message);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding:16 }}>
      <h2 style={{ marginTop:0 }}>Approvals</h2>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
        <button className="btn" onClick={approveAll} disabled={rows.length === 0 || loading}>
          Approve All
        </button>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        {msg && <span style={{ alignSelf:"center" }}>{msg}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding:12 }}>No approvals pending.</div>
      ) : (
        <div className="card" style={{ padding:12, overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:720 }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Platform</th>
                <th style={th}>To</th>
                <th style={th}>Draft</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{new Date(r.created_at).toLocaleString?.() || r.created_at}</td>
                  <td style={td}>{r.platform}</td>
                  <td style={td}>{r.to_name || r.handle || r.contact_id || "—"}</td>
                  <td style={{ ...td, maxWidth:520 }}>
                    <div style={{ whiteSpace:"pre-wrap" }}>{r.text || ""}</div>
                  </td>
                  <td style={{ ...td, whiteSpace:"nowrap" }}>
                    <button className="btn" onClick={() => approve(r.id)} style={{ marginRight:8 }}>Approve</button>
                    <button className="btn" onClick={() => reject(r.id)} style={{ opacity:.85 }}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid rgba(255,255,255,.15)", fontWeight:700 };
const td = { padding:"8px 10px", borderBottom:"1px solid rgba(255,255,255,.08)", verticalAlign:"top" };
