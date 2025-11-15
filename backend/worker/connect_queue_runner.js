import { supaAdmin } from '../db.js'
import { sendLinkedInConnect } from '../lib/li_connect.js'
import { isSeriousLinkedInError, notifyOps } from '../utils/ops_alerts.js'

const LOOP_INTERVAL_MS = Number(process.env.CONNECT_QUEUE_INTERVAL_MS || 20000)
const LOG_PREFIX = '[connect_queue]'

export function startConnectQueueWorker() {
  async function cycle() {
    try {
      await tickOnce()
    } catch (e) {
      const message = String(e?.message || e)
      console.error(`${LOG_PREFIX} tick_error`, message)
      await notifyOps('Connect queue tick failed', `startConnectQueueWorker tick threw: ${message}`, {
        meta: { error: message },
        throttleKey: `connect_queue:tick:${message}`
      })
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
      console.log(`${LOG_PREFIX} job ${job.id} sent (${result?.result?.status || 'ok'})`)
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
      const errMsg = String(result?.error || 'send_failed')
      console.warn(`${LOG_PREFIX} job ${job.id} failed: ${errMsg}`)
      await supaAdmin
        .from('connect_queue')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          error: errMsg.slice(0, 240)
        })
        .eq('id', job.id)
      if (isSeriousLinkedInError(errMsg)) {
        await notifyOps('LinkedIn connect failed', `Connect queue job ${job.id} failed: ${errMsg}`, {
          meta: { jobId: job.id, userId: job.user_id, error: errMsg },
          throttleKey: `connect_queue:job:${errMsg}`
        })
      }
    }
  } catch (e) {
    const errMsg = String(e?.message || e)
    console.error(`${LOG_PREFIX} job ${job.id} exception: ${errMsg}`)
    await supaAdmin
      .from('connect_queue')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
        error: errMsg.slice(0, 240)
      })
      .eq('id', job.id)
    await notifyOps('LinkedIn connect exception', `Exception while sending connect queue job ${job.id}: ${errMsg}`, {
      meta: { jobId: job.id, userId: job.user_id, error: errMsg },
      throttleKey: `connect_queue:exception:${errMsg}`
    })
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
    console.error(`${LOG_PREFIX} fetch_error`, error.message)
    await notifyOps('Connect queue fetch error', `Failed to fetch connect queue job: ${error.message}`, {
      meta: { error: error.message },
      throttleKey: 'connect_queue:fetch_error'
    })
    return null
  }

  const job = data?.[0]
  if (!job) return null

  await supaAdmin
    .from('connect_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.id)

  console.log(`${LOG_PREFIX} dequeued job ${job.id} for user ${job.user_id}`)
  return { ...job, status: 'processing' }
}
