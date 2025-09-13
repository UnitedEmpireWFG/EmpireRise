import { api } from './shared'

export async function bulkApproveLinkedIn({ ids = [], filter = 'ready' } = {}) {
  const { data } = await api.post('/api/queue/bulk_approve', { network: 'linkedin', ids, filter })
  return data
}