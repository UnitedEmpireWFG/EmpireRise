import { createClient } from "@supabase/supabase-js"
import "dotenv/config"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env")
}

const client = createClient(url, key)

export default client
export const supa = client
export const supabase = client

