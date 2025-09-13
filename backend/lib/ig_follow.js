export async function sendIgFollow(job) {
  // use Meta Graph calls to follow if available for your account type
  // otherwise mark as not_supported
  return { ok: false, error: 'not_supported' }
}
