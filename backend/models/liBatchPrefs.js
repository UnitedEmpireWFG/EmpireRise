const db = require('../utils/db.js')

async function getPrefs(userId) {
  const { rows } = await db.query('SELECT * FROM li_batch_prefs WHERE user_id=$1', [userId])
  if (rows.length === 0) {
    const insert = await db.query(
      'INSERT INTO li_batch_prefs (user_id) VALUES ($1) RETURNING *',
      [userId]
    )
    return insert.rows[0]
  }
  return rows[0]
}

async function updatePrefs(userId, patch) {
  const fields = []
  const values = []
  let i = 1
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k}=$${i++}`)
    values.push(v)
  }
  values.push(userId)
  const sql = `UPDATE li_batch_prefs SET ${fields.join(', ')}, updated_at=NOW() WHERE user_id=$${i} RETURNING *`
  const { rows } = await db.query(sql, values)
  return rows[0]
}

module.exports = { getPrefs, updatePrefs }

