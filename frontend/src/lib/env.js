export const ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  // Backend API base (Render URL or local dev)
  API_URL: import.meta.env.VITE_API_URL || 'https://empirerise.onrender.com',
}