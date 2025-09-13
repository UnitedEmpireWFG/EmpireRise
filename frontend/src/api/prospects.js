import { api } from './shared'

export async function listProspects(status) {
  const { data } = await api.get('/api/prospects', { params: { status } })
  return data
}
export async function createProspect(p) {
  const { data } = await api.post('/api/prospects', p)
  return data
}
export async function updateProspect(id, patch) {
  const { data } = await api.patch(`/api/prospects/${id}`, patch)
  return data
}
export async function markProspectDnc(id, reason) {
  const { data } = await api.post(`/api/prospects/${id}/dnc`, { reason })
  return data
}
export async function convertProspect(id) {
  const { data } = await api.post(`/api/prospects/${id}/convert`)
  return data
}