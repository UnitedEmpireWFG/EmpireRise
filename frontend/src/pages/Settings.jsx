import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { supa } from "../lib/supa";

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/,'');
const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

function computeLocalPlan(s) {
  const weeklyTarget = toNum(s.weekly_target_appts ?? 5);
  const rateBooked   = toNum(s.rate_booked ?? 0.02) || 0.02;
  const ticksPerDay  = Math.max(1, toNum(s.ticks_per_day ?? 6));
  const dailyCap     = Math.max(0, toNum(s.daily_cap ?? 30));
  const mix = s.platform_mix || { linkedin: 50, instagram: 30, facebook: 20 };
  const li = Math.max(0, Math.min(100, toNum(mix.linkedin)));
  const ig = Math.max(0, Math.min(100, toNum(mix.instagram)));
  const fb = Math.max(0, Math.min(100, toNum(mix.facebook)));
  const totalPct = li + ig + fb || 100;
  const fLI = li / totalPct, fIG = ig / totalPct, fFB = fb / totalPct;
  const capLI = Math.max(0, toNum(s.cap_linkedin ?? 80));
  const capIG = Math.max(0, toNum(s.cap_instagram ?? 60));
  const capFB = Math.max(0, toNum(s.cap_facebook ?? 60));
  const sumPlatformMax = capLI + capIG + capFB;
  const needWeek   = Math.ceil(weeklyTarget / rateBooked);
  const needPerDay = Math.ceil(needWeek / 7);
  const capByDaily = dailyCap > 0 ? dailyCap : Number.POSITIVE_INFINITY;
  const maxByMix = Math.min(
    fLI > 0 ? Math.floor(capLI / fLI) : Number.POSITIVE_INFINITY,
    fIG > 0 ? Math.floor(capIG / fIG) : Number.POSITIVE_INFINITY,
    fFB > 0 ? Math.floor(capFB / fFB) : Number.POSITIVE_INFINITY
  );
  const perDayAllowed = Math.min(capByDaily, maxByMix, sumPlatformMax);
  const perTick = Math.max(1, Math.ceil(perDayAllowed / Math.max(1, ticksPerDay)));
  const perPlatform = {
    linkedin: Math.min(capLI, Math.round(perDayAllowed * fLI)),
    instagram: Math.min(capIG, Math.round(perDayAllowed * fIG)),
    facebook: Math.min(capFB, Math.round(perDayAllowed * fFB))
  };
  return { needSent: needWeek, perDayNeeded: needPerDay, perDayAllowed, perTick, capExceeded: needPerDay > perDayAllowed, shortfall: Math.max(0, needPerDay - perDayAllowed), perPlatform, sumPlatformMax };
}

export default function Settings() {
  const [form, setForm] = useState({
    daily_cap: 30, weekly_target_appts: 5, ticks_per_day: 6, per_tick: 3,
    rate_open: 0.25, rate_reply: 0.08, rate_qualified: 0.03, rate_booked: 0.02,
    platform_mix: { linkedin: 50, instagram: 30, facebook: 20 },
    cap_linkedin: 80, cap_instagram: 60, cap_facebook: 60,
    li_batch_cron: "0 9 * * *", li_batch_enabled: false
  });
  const [conns, setConns] = useState({ facebook:false, instagram:false, linkedin:false });
  const [msg, setMsg] = useState(""); const [saving, setSaving] = useState(false);
  const plan = useMemo(() => computeLocalPlan(form), [form]);

  useEffect(() => { (async () => {
    try { const j = await apiFetch("/api/app-settings"); if (j?.ok && j.settings) setForm((f)=>({ ...f, ...j.settings })); } catch {}
    try { const c = await apiFetch("/api/app-settings/connections"); if (typeof c?.ok!=="undefined") setConns({ facebook:!!c.facebook, instagram:!!c.instagram, linkedin:!!c.linkedin }); } catch {}
  })() }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    const ok = u.searchParams.get('ok'); const connected = u.searchParams.get('connected');
    if (ok && connected) {
      setMsg(ok === 'true' ? `${connected} connected.` : `Failed to connect ${connected}.`);
      u.searchParams.delete('ok'); u.searchParams.delete('connected');
      window.history.replaceState({}, '', u.toString());
    }
  }, []);

  const onNum  = (k) => (e)=> setForm((f)=>({ ...f, [k]: e.target.value==="" ? "" : +e.target.value }));
  const onText = (k) => (e)=> setForm((f)=>({ ...f, [k]: e.target.value }));
  const onBool = (k) => (e)=> setForm((f)=>({ ...f, [k]: !!e.target.checked }));
  const onMix  = (k) => (e)=> {
    const v = Math.max(0, Math.min(100, +e.target.value||0));
    setForm((f)=>({ ...f, platform_mix: { ...f.platform_mix, [k]: v }}));
  };
  function clampDailyCap(next) {
    const n = Math.max(0, +next||0);
    const sumMax = (+form.cap_linkedin||0)+(+form.cap_instagram||0)+(+form.cap_facebook||0);
    setForm((f)=>({ ...f, daily_cap: Math.min(n, sumMax) }));
  }
  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const json = await apiFetch("/api/app-settings", { method:"POST", body:JSON.stringify(form) });
      if (!json.ok) throw new Error(json.error || "save_failed");
      setForm((f)=>({ ...f, ...json.settings }));
      setMsg(json.plan?.capExceeded ? `Saved. Plan exceeds safe capacity by ${json.plan.shortfall}/day.` : "Saved.");
    } catch(e){ setMsg("Save failed: " + (e.message||"unknown")); } finally { setSaving(false); setTimeout(()=>setMsg(""), 3000) }
  };

  async function connect(platform) {
    const { data } = await supa.auth.getSession()
    const token = data?.session?.access_token
    if (!token) { setMsg("Please sign in first."); return }
    const url = platform === 'linkedin'
      ? `${API_BASE}/oauth/linkedin/login?state=${encodeURIComponent(token)}`
      : `${API_BASE}/oauth/meta/login?platform=${platform}&state=${encodeURIComponent(token)}`
    window.location.assign(url)
  }

  const mix = form.platform_mix || { linkedin:0, instagram:0, facebook:0 }
  const totalMix = (mix.linkedin||0)+(mix.instagram||0)+(mix.facebook||0)
  const mixOk = totalMix === 100
  const plannedByPlatform = {
    linkedin: Math.floor((form.daily_cap*((mix.linkedin||0))/100)),
    instagram: Math.floor((form.daily_cap*((mix.instagram||0))/100)),
    facebook: Math.floor((form.daily_cap*((mix.facebook||0))/100)),
  }
  const over = {
    linkedin: Math.max(0, plannedByPlatform.linkedin - (+form.cap_linkedin||0)),
    instagram: Math.max(0, plannedByPlatform.instagram - (+form.cap_instagram||0)),
    facebook: Math.max(0, plannedByPlatform.facebook - (+form.cap_facebook||0))
  }

  return (
    <div style={{ display:"grid", gap:16, alignItems:"start", gridTemplateColumns:"1fr 1fr" }}>
      <div className="card" style={{ padding:16 }}>
        <h3 style={{ marginTop:0 }}>Targets & Caps</h3>
        <Field title="Weekly appointments target"><input type="number" min="0" value={form.weekly_target_appts} onChange={onNum("weekly_target_appts")} /></Field>
        <Field title="Daily message cap (global)">
          <input type="number" min="0" value={form.daily_cap} onChange={(e)=>clampDailyCap(e.target.value)} />
          <div style={{ fontSize:12, marginTop:4, opacity:.85 }}>Max allowed by platform caps: <b>{plan.sumPlatformMax}</b></div>
        </Field>
        <Field title="Ticks per day"><input type="number" min="1" value={form.ticks_per_day} onChange={onNum("ticks_per_day")} /></Field>
        <div style={{ marginTop:12, fontWeight:800 }}>Per platform daily caps</div>
        <Grid2>
          <span>LinkedIn cap</span><input type="number" min="0" value={form.cap_linkedin} onChange={onNum("cap_linkedin")} />
          <span>Instagram cap</span><input type="number" min="0" value={form.cap_instagram} onChange={onNum("cap_instagram")} />
          <span>Facebook cap</span><input type="number" min="0" value={form.cap_facebook} onChange={onNum("cap_facebook")} />
        </Grid2>
        <div style={{ marginTop:12, fontWeight:800 }}>Platform mix</div>
        <Grid2>
          <span>LinkedIn %</span><input type="number" min="0" max="100" value={mix.linkedin} onChange={onMix("linkedin")} />
          <span>Instagram %</span><input type="number" min="0" max="100" value={mix.instagram} onChange={onMix("instagram")} />
          <span>Facebook %</span><input type="number" min="0" max="100" value={mix.facebook} onChange={onMix("facebook")} />
        </Grid2>
        <div style={{ fontSize:12, marginTop:6, color: mixOk ? "#7ad17a" : "salmon" }}>
          Total {totalMix}%. {mixOk ? "OK" : "Make it 100%."}
        </div>
        <div style={{ marginTop:10, fontSize:13, lineHeight:1.7 }}>
          Planned from global cap {form.daily_cap}:
          <div>• LinkedIn: <b>{plannedByPlatform.linkedin}</b> / cap {form.cap_linkedin}{over.linkedin>0 && <span style={{color:"salmon"}}> (over by {over.linkedin})</span>}</div>
          <div>• Instagram: <b>{plannedByPlatform.instagram}</b> / cap {form.cap_instagram}{over.instagram>0 && <span style={{color:"salmon"}}> (over by {over.instagram})</span>}</div>
          <div>• Facebook: <b>{plannedByPlatform.facebook}</b> / cap {form.cap_facebook}{over.facebook>0 && <span style={{color:"salmon"}}> (over by {over.facebook})</span>}</div>
        </div>
        <div style={{ marginTop:16 }}>
          <button className="btn" onClick={save} disabled={!mixOk || saving}>{saving ? "Saving..." : "Save"}</button>
          {msg ? <span style={{ marginLeft:12 }}>{msg}</span> : null}
        </div>
      </div>
      <div className="card" style={{ padding:16 }}>
        <h3 style={{ marginTop:0 }}>Social connections</h3>
        <ConnRow label="Facebook"  ok={conns.facebook}  onClick={()=>connect('facebook')} />
        <ConnRow label="Instagram" ok={conns.instagram} onClick={()=>connect('instagram')} />
        <ConnRow label="LinkedIn"  ok={conns.linkedin}  onClick={()=>connect('linkedin')} />
        {msg ? <div style={{ marginTop:10 }}>{msg}</div> : null}
      </div>
    </div>
  )
}

function ConnRow({ label, ok, onClick }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
      <span>{label}</span>
      {ok ? <span style={{ color:"#7ad17a", fontWeight:700 }}>connected</span> : <button className="btn" onClick={onClick}>Connect</button>}
    </div>
  );
}
function Field({ title, children }) { return <label style={{ display:"block", marginBottom:8 }}>{title}<div style={{ display:"block", width:260, marginTop:4 }}>{children}</div></label> }
function Grid2({ children }) { return <div style={{ display:"grid", gridTemplateColumns:"auto 140px", gap:8, marginTop:6 }}>{children}</div>; }