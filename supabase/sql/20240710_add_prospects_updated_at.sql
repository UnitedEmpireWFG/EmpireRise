-- Ensure prospects table exposes updated_at for scoring and caching
alter table public.prospects
  add column if not exists updated_at timestamptz default now();
