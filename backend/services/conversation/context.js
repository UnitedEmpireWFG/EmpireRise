// backend/services/conversation/context.js
import { supa } from '../../db.js'

export async function buildContext(contact, platform) {
  // thread (if any)
  const { data: threads } = await supa
    .from('conv_threads')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('platform', platform)
    .order('updated_at', { ascending: false })
    .limit(1)

  const thread = threads?.[0] || null

  // recent messages (last 6 turns)
  let history = []
  if (thread) {
    const { data: msgs } = await supa
      .from('conv_messages')
      .select('role,text,created_at,sentiment')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(6)
    history = msgs || []
  }

  // settings for rates / caps (optional, helpful context)
  const { data: settingsRow } = await supa
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  // normalized contact profile
  const profile = {
    name: contact.name || null,
    handle: contact.handle || null,
    title: contact.title || null,
    company: contact.company || null,
    location: contact.location || null,
    interests: contact.interests || null,
    profiles: contact.profile_urls || null
  }

  return {
    // routing
    platform,
    persona: 'client', // or let ai decide; can be changed dynamically
    state: thread?.state || 'intro',
    last_sentiment: thread?.sentiment || 'neutral',
    path: thread?.path || null, // 'client'|'recruit'|'referral'|null

    // data used to personalize
    profile,
    history,

    // optional: global settings signal to the model (don’t expose secrets)
    guardrails: {
      weekly_target_appts: settingsRow?.weekly_target_appts || 5,
      caps: {
        linkedin: settingsRow?.cap_linkedin ?? 80,
        instagram: settingsRow?.cap_instagram ?? 60,
        facebook: settingsRow?.cap_facebook ?? 60
      }
    }
  }
}
