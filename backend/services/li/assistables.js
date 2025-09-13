const db = require('../../utils/db.js')

async function getLinkedInAssistables(limit, userId) {
  const { rows: capRows } = await db.query('SELECT li_daily_cap FROM settings WHERE user_id=$1', [userId])
  const cap = capRows[0]?.li_daily_cap || 50
  const take = Math.min(limit, cap)
  const { rows } = await db.query(
    `SELECT id, payload FROM li_candidates
     WHERE user_id=$1 AND status='pending'
     ORDER BY priority DESC, created_at ASC
     LIMIT $2`,
    [userId, take]
  )
  return rows.map(r => JSON.parse(r.payload))
}

module.exports = { getLinkedInAssistables }

