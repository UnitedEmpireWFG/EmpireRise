import React, { useEffect, useState } from 'react'
import { bulkApproveLinkedIn } from '../api/queue'

export default function QueueList({ fetchItems }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)
    const data = await fetchItems(filter)
    setItems(data)
    setSelected(new Set())
    setLoading(false)
  }

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function approveSelected() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    await bulkApproveLinkedIn({ ids })
    await load()
  }

  async function approveAllReady() {
    await bulkApproveLinkedIn({ filter: 'ready' })
    await load()
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <div className='row space-between'>
        <div className='filters'>
          <button onClick={() => setFilter('all')} className={filter==='all'?'btn primary':'btn'}>All</button>
          <button onClick={() => setFilter('linkedin')} className={filter==='linkedin'?'btn primary':'btn'}>LinkedIn</button>
          <button onClick={() => setFilter('meta')} className={filter==='meta'?'btn primary':'btn'}>Meta</button>
          <button onClick={() => setFilter('ready')} className={filter==='ready'?'btn primary':'btn'}>Ready</button>
          <button onClick={() => setFilter('draft')} className={filter==='draft'?'btn primary':'btn'}>Drafts</button>
        </div>
        <div className='actions'>
          <button className='btn' onClick={approveSelected}>Approve selected</button>
          <button className='btn primary' onClick={approveAllReady}>Approve all LinkedIn ready</button>
        </div>
      </div>

      <div className='list'>
        {items.map(it => (
          <div key={it.id} className='card row'>
            <input type='checkbox' checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
            <div className='grow'>
              <div className='title'>{it.title || it.preview || '(no title)'}</div>
              <div className='meta'>
                <StatusChip status={it.status} />
                <span className='sep'>•</span>
                <span>{it.network}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusChip({ status }) {
  const color =
    status === 'ready' ? '#10b981' :
    status === 'draft' ? '#6b7280' :
    status === 'approved' ? '#f59e0b' :
    status === 'sent' ? '#3b82f6' :
    '#9ca3af'
  return <span style={{ background: color, color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{status}</span>
}