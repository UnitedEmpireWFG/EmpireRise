import { supaAdmin } from '../db.js'
import { sendLinkedInConnect } from '../lib/li_connect.js'

const LOOP_INTERVAL_MS = Number(process.env.CONNECT_QUEUE_INTERVAL_MS || 20000)

export function startConnectQueueWorker() {
  async function cycle() {
    try {
      await tickOnce()
    } catch (e) {
      console.log('[connect_queue] tick_error', e?.message || e)
    } finally {
      setTimeout(cycle, LOOP_INTERVAL_MS)
    }
  }

  cycle()
}

async function tickOnce() {
  const job = await dequeueNext()
  if (!job) return

  try {
    const result = await sendLinkedInConnect(job)
    if (result?.ok) {
      await supaAdmin
        .from('connect_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: null
        })
        .eq('id', job.id)
    } else {
      await supaAdmin
        .from('connect_queue')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          error: (result?.error || 'send_failed').slice(0, 240)
        })
        .eq('id', job.id)
    }
  } catch (e) {
    await supaAdmin
      .from('connect_queue')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
        error: String(e?.message || e).slice(0, 240)
      })
      .eq('id', job.id)
  }
}

async function dequeueNext() {
  const { data, error } = await supaAdmin
    .from('connect_queue')
    .select('*')
    .in('status', ['queued', 'processing'])
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true, nullsFirst: true })
    .limit(1)

  if (error) {
    console.log('[connect_queue] fetch_error', error.message)
    return null
  }

  const job = data?.[0]
  if (!job) return null

  await supaAdmin
    .from('connect_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.id)

  return { ...job, status: 'processing' }
}
