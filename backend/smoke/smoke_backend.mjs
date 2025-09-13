const ORIGIN = process.env.ORIGIN_APP
const API = process.env.API_BASE || 'http://localhost:8787'  // Your API when running locally

async function assert(cond, msg) {
  if (!cond) {
    console.error('✖', msg)
    process.exit(1)
  }
}

async function run() {
  console.log(`→ BE smoke @ ${API}`)

  // 1) Health
  const r1 = await fetch(`${API}/api/health`)
  assert(r1.ok, `/api/health not ok: ${r1.status}`)
  const j1 = await r1.json().catch(()=>null)
  assert(j1?.ok === true, 'health ok flag missing')
  console.log('✓ /api/health')

  // 2) CORS preflight (OPTIONS)
  const pre = await fetch(`${API}/api/health`, {
    method: 'OPTIONS',
    headers: {
      'Origin': ORIGIN || 'https://example.netlify.app',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type'
    }
  })
  assert(pre.status === 204, `CORS preflight failed: ${pre.status}`)
  console.log('✓ CORS preflight ok')

  // 3) Protected route blocks anon
  const r2 = await fetch(`${API}/api/dashboard`)
  // Your server normalizes unauthorized to HTTP 401
  assert(r2.status === 401 || r2.status === 200, `Unexpected status for /api/dashboard: ${r2.status}`)
  if (r2.status === 200) {
    const j2 = await r2.json().catch(()=>null)
    assert(j2?.ok === false && /unauthorized/.test(j2?.error || ''), 'Expected unauthorized JSON on /api/dashboard')
  }
  console.log('✓ /api/dashboard protected')

  console.log('✔ BE smoke passed')
}

run().catch((e) => {
  console.error('✖ BE smoke failed:', e?.message || e)
  process.exit(1)
})