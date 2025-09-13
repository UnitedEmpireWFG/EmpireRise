import { api } from './shared'
export async function resolveProfiles(payload) {
  const { data } = await api.post('/api/resolver/profiles', payload)
  return data
}