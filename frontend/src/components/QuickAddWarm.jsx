import { useState } from "react";
import { postJSON } from "../api/client";

export default function QuickAddWarm({ onAdded }) {
  const [form, setForm] = useState({
    name: "",
    platform: "instagram",
    handle: "",
    external_id: "",
    persona: "client",
    city: "",
    notes: "",
    summary: ""
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  function set(k, v) { setForm(s => ({ ...s, [k]: v })); }

  async function save() {
    setErr(""); setOk(""); setLoading(true);
    try {
      const resp = await postJSON("/api/leads/add-warm", form);
      if (!resp?.ok) throw new Error(resp?.error || "Failed");
      setOk("Saved");
      if (onAdded) onAdded(resp.contact);
      setForm({
        name: "",
        platform: "instagram",
        handle: "",
        external_id: "",
        persona: "client",
        city: "",
        notes: "",
        summary: ""
      });
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick add warm lead</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input placeholder="Name" value={form.name} onChange={e=>set("name",e.target.value)} />
        <select value={form.platform} onChange={e=>set("platform",e.target.value)}>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="linkedin">LinkedIn</option>
        </select>

        <input placeholder="Handle or username" value={form.handle} onChange={e=>set("handle",e.target.value)} />
        <input placeholder="External ID (optional)" value={form.external_id} onChange={e=>set("external_id",e.target.value)} />

        <select value={form.persona} onChange={e=>set("persona",e.target.value)}>
          <option value="client">Client</option>
          <option value="recruit">Recruit</option>
        </select>
        <input placeholder="City (optional)" value={form.city} onChange={e=>set("city",e.target.value)} />

        <input placeholder="Internal notes" value={form.notes} onChange={e=>set("notes",e.target.value)} />
        <input placeholder="Summary of your last convo" value={form.summary} onChange={e=>set("summary",e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={save} disabled={loading}>Save</button>
        {ok && <span style={{ color: "var(--ok,#67c23a)" }}>{ok}</span>}
        {err && <span style={{ color: "var(--danger,#ff5252)" }}>API: {err}</span>}
      </div>
    </div>
  );
}