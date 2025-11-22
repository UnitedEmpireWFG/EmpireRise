import { createClient } from '@supabase/supabase-js'

const url  = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) console.warn('[db] SUPABASE_URL missing.')
if (!svc) console.warn('[db] SUPABASE_SERVICE_ROLE_KEY missing. Some admin ops may fail.')

export const supa = createClient(
  url,
  anon || 'anon-not-set',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
)

export const supaAdmin = createClient(
  url,
  svc || 'service-key-not-set',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
)