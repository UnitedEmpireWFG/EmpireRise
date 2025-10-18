export async function runLinkedInBatch(globalUserCache) {
  console.log('[li_batch_runner] Simulated LinkedIn batch started.')
  await new Promise(r => setTimeout(r, 2000))
  console.log('[li_batch_runner] Simulated LinkedIn batch finished.')
}
