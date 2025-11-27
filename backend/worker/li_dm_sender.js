import { supa } from '../db.js'
import { LinkedInDriver } from '../services/linkedin_driver.js'
import { timePolicy } from '../services/time_windows.js'
import { isSeriousLinkedInError, notifyOps } from '../utils/ops_alerts.js'
import { getCookieFilePath } from '../lib/linkedinCookies.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchNextBatch(limit = 15) {
  const { data, error } = await supa
    .from('queue')
    .select('id, contact_id, platform, status, payload, scheduled_at, user_id, campaign')
    .in('status', ['ready', 'approved'])
    .eq('platform', 'linkedin')
    .order('scheduled_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function markQueue(id, status, error = null) {
  await supa.from('queue').update({ status, error, updated_at: new Date().toISOString() }).eq('id', id)
}

async function getContact(id) {
  const { data } = await supa.from('contacts').select('id, handle').eq('id', id).single()
  return data || null
}

export async function tickLinkedInSender() {
  if (!timePolicy.canSendNow()) return
  try {
    const rows = await fetchNextBatch(15)
    console.log(`[li_dm_sender] fetched ${rows.length} row(s)`) // include zero-length batches for visibility
    if (!rows.length) return

    const byUser = rows.reduce((m, r) => { (m[r.user_id] ||= []).push(r); return m }, {})
    console.log(`[li_dm_sender] processing ${Object.keys(byUser).length} user(s)`)

    for (const [userId, items] of Object.entries(byUser)) {
      const cookiesPath = getCookieFilePath(userId)
      const driver = new LinkedInDriver({ cookiesPath })
      let sent = 0
      let failed = 0
      console.log(`[li_dm_sender] user ${userId}: processing ${items.length} queued message(s)`)
      try {
        await driver.init()

        for (const row of items) {
          try {
            const payload = typeof row?.payload === 'string' ? JSON.parse(row.payload || '{}') : (row?.payload || {})
            const contact = await getContact(row.contact_id)
            const handle = String(contact?.handle || '').trim().toLowerCase()
            const text = String(payload?.text || '').trim()
            if (!handle || !text) {
              failed++
              await markQueue(row.id, 'error', 'missing_handle_or_text')
              console.warn(`[li_dm_sender] user ${userId} row ${row.id} skipped: missing handle/text`)
              continue
            }

            await driver.sendMessageToHandle(handle, text)
            await markQueue(row.id, 'sent')
            sent++
            console.log(`[li_dm_sender] user ${userId} row ${row.id} sent`)
            await sleep(1800 + Math.random() * 900)
          } catch (e) {
            const errMsg = String(e?.message || e)
            failed++
            console.warn(`[li_dm_sender] user ${userId} row ${row.id} failed: ${errMsg}`)
            await markQueue(row.id, 'error', errMsg)
            if (isSeriousLinkedInError(errMsg)) {
              await notifyOps(
                'LinkedIn DM failed',
                `LinkedIn DM send failed for user ${userId}: ${errMsg}`,
                {
                  meta: { queueId: row.id, userId, error: errMsg },
                  throttleKey: `li_dm_sender:row:${errMsg}`
                }
              )
            }
          }
        }
      } catch (e) {
        const reason = String(e?.message || e)
        failed += items.length
        console.error(`[li_dm_sender] user ${userId} driver init failed: ${reason}`)
        for (const row of items) await markQueue(row.id, 'error', `driver_init_failed:${reason}`)
        if (isSeriousLinkedInError(reason) || reason.includes('driver_init_failed')) {
          await notifyOps(
            'LinkedIn DM driver failed',
            `LinkedIn DM driver failed to initialize for user ${userId}: ${reason}`,
            {
              meta: { userId, error: reason },
              throttleKey: `li_dm_sender:driver:${reason}`
            }
          )
        }
      } finally {
        console.log(`[li_dm_sender] user ${userId} summary: sent=${sent}, failed=${failed}`)
        try { await driver.close?.() } catch {}
      }
    }
  } catch (err) {
    const message = String(err?.message || err)
    console.error('[li_dm_sender] tick_error', message)
    await notifyOps('LinkedIn DM tick failed', `tickLinkedInSender threw: ${message}`, {
      meta: { error: message },
      throttleKey: `li_dm_sender:tick:${message}`
    })
  }
}
