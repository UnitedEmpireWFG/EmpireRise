-- app_settings must exist with these columns
create table if not exists public.app_settings (
  user_id uuid primary key,
  linkedin_access_token text,
  linkedin_expires_at timestamptz,
  linkedin_user_id text,
  meta_access_token text,
  instagram_access_token text,
  updated_at timestamptz default now(),
  li_needs_seed boolean default false,
  last_li_seed_at timestamptz
);

-- prospects minimal
create table if not exists public.prospects (
  user_id uuid not null,
  source text,
  li_handle text,
  name text,
  headline text,
  location_text text,
  open_to_work boolean default false,
  created_at timestamptz default now(),
  primary key (user_id, li_handle)
);

-- drafts minimal
create table if not exists public.drafts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  channel text not null,
  li_handle text,
  body text,
  status text default 'draft',
  created_at timestamptz default now()
);

-- allow service role to write
alter table public.app_settings enable row level security;
alter table public.prospects enable row level security;
alter table public.drafts enable row level security;

-- simple permissive policies for service role writes
do $$
begin
  if not exists (select 1 from pg_policies where polname = 'prospects_all_rw') then
    create policy prospects_all_rw on public.prospects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'drafts_all_rw') then
    create policy drafts_all_rw on public.drafts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'app_settings_all_rw') then
    create policy app_settings_all_rw on public.app_settings for all using (true) with check (true);
  end if;
end$$;