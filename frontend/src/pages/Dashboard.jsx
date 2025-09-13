import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'

export default function Dashboard() {
  const [msg, setMsg] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    (async () => {
      setMsg('')
      const j = await apiFetch('/dashboard')
      if (j?.ok === false && j?.error === 'unauthorized') {
        setMsg('Not signed in.')
      } else {
        setData(j)
      }
    })()
  }, [])

  const safe = (n) => (Number.isFinite(+n) ? +n : 0)
  const replies=safe(data?.replies), qualified=safe(data?.qualified), booked=safe(data?.booked), sent=safe(data?.sent)
  const replyRate  = sent>0 ? Math.round((replies/sent)*100) : 0
  const qualRate   = replies>0 ? Math.round((qualified/replies)*100) : 0
  const bookedRate = replies>0 ? Math.round((booked/replies)*100) : 0

  return (
    <div style={{ display:'grid', gap:16 }}>
      {msg && <div className="card" style={{ padding:12, borderColor:'salmon' }}>{msg}</div>}
      <div className="card" style={{ padding:16 }}>
        <h2 style={{ marginTop:0 }}>Today</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          <Stat label="Messages sent" value={sent} />
          <Stat label="Replies" value={replies} sub={`${replyRate}% of sent`} />
          <Stat label="Qualified" value={qualified} sub={`${qualRate}% of replies`} />
          <Stat label="Booked" value={booked} sub={`${bookedRate}% of replies`} />
        </div>
      </div>
    </div>
  )
}
function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ padding:12 }}>
      <div style={{ opacity:.8, fontSize:12 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:900, lineHeight:1 }}>{value}</div>
      {sub ? <div style={{ opacity:.8, fontSize:12, marginTop:4 }}>{sub}</div> : null}
    </div>
  )
}