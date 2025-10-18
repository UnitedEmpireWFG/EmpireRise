import cron from 'node-cron'
import { runLinkedInBatch } from '../../worker/li_batch_runner.js'

export function initLiDailyBatch(globalUserCache) {
  try {
    // Cancel any previous jobs (if running)
    if (global.liDailyBatchTask && global.liDailyBatchTask.stop) {
      global.liDailyBatchTask.stop()
    }

    // Schedule to run every day at 9 AM (adjust as needed)
    const task = cron.schedule('0 9 * * *', async () => {
      console.log('[liDailyBatch] Running daily LinkedIn batch job...')
      try {
        await runLinkedInBatch(globalUserCache)
        console.log('[liDailyBatch] Batch completed successfully.')
      } catch (err) {
        console.error('[liDailyBatch] Batch run error:', err.message)
      }
    }, { timezone: 'America/Edmonton' })

    // Save globally and return for re-arm support
    global.liDailyBatchTask = task
    console.log('[liDailyBatch] initialized successfully.')
    return task
  } catch (err) {
    console.error('[liDailyBatch] init error:', err.message)
    return null
  }
}
