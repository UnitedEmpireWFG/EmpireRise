import { api } from './shared'

export async function getLiBatchPrefs() {
  const { data } = await api.get('/api/li/batch/prefs')
  return data
}

export async function saveLiBatchPrefs(patch) {
  const { data } = await api.post('/api/li/batch/prefs', patch)
  return data
}