/* backend/utils/db.js (Supabase-only shim) */
import { supa } from "../db.js";

/**
 * Some older modules used to do: import db from './utils/db'
 * They expected "db.query(...)" or "pool". We don't want that anymore.
 * Export a tiny shim so those imports don't crash, but steer them to Supabase.
 */
export const supabase = supa;

// Hard fail if anyone still calls db.query(...) (so we can spot & fix it)
export function query() {
  throw new Error("Remove db.query(...) usage. Use Supabase: import { supa } from '../db.js' and call supa.from(...).");
}

// Kept only to avoid runtime "cannot read property 'end' of undefined" patterns elsewhere
export const pool = null;

export default { supa, supabase, query, pool };
