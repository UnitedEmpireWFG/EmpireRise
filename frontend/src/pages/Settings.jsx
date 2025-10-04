async function refresh() {
  try {
    const token = await requireToken()
    const ts = Date.now()
    const r = await fetch(`${API}/api/social/status?ts=${ts}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      cache: 'no-store'
    })
    if (!r.ok) throw new Error(`status_${r.status}`)
    const j = await r.json()
    setLi(Boolean(j?.linkedin_oauth))
    setLiCookies(Boolean(j?.linkedin_cookies))
    setFb(Boolean(j?.facebook))
    setIg(Boolean(j?.instagram))
    setMsg('')
    if (j?.dbg) console.log('social_status_dbg', j.dbg)
  } catch (e) {
    setMsg(`Status check failed ${String(e?.message || e)}`)
  }
}

async function afterPopupRefresh() {
  await new Promise(r => setTimeout(r, 400))
  await refresh()
  await new Promise(r => setTimeout(r, 400))
  await refresh()
}
