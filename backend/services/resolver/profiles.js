const fetch = require('node-fetch')

async function resolveWithSearch(name, hints) {
  const q = `${name} ${hints?.city || ''} ${hints?.company || ''} LinkedIn Instagram Facebook`.trim()
  if (!process.env.BING_KEY && !process.env.SERPAPI_KEY) return {}
  let results = []

  if (process.env.BING_KEY) {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}`
    const resp = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_KEY } })
    const data = await resp.json()
    const webPages = data.webPages?.value || []
    results = webPages.map(x => x.url)
  } else if (process.env.SERPAPI_KEY) {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_KEY}`
    const resp = await fetch(url)
    const data = await resp.json()
    results = (data.organic_results || []).map(x => x.link)
  }

  const out = {}
  for (const u of results) {
    if (/linkedin\.com\/in\//i.test(u)) out.linkedin = out.linkedin || u
    if (/instagram\.com\//i.test(u)) out.instagram = out.instagram || u
    if (/facebook\.com\//i.test(u)) out.facebook = out.facebook || u
  }
  return out
}

async function resolveProfiles({ name, hints = {}, seed = {} }) {
  const fromSearch = await resolveWithSearch(name, hints)
  return { ...seed, ...fromSearch }
}

module.exports = { resolveProfiles }
