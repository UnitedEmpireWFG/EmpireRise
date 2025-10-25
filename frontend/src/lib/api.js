import { ENV } from './env.js'

export async function apiGet(path) {
  const res = await fetch(`${ENV.API_URL}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

export async function apiPost(path, body = {}) {
  const res = await fetch(`${ENV.API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`)
  return res.json()
}