create extension if not exists pgcrypto;

-- Application + OAuth settings -------------------------------------------------
create table if not exists public.app_settings (
  user_id uuid primary key,
  linkedin_access_token text,
  linkedin_expires_at timestamptz,
  linkedin_user_id text,
  meta_access_token text,
  meta_profile jsonb,
  instagram_access_token text,
  updated_at timestamptz default now(),
  li_needs_seed boolean default false,
  last_li_seed_at timestamptz
);

-- Global configuration + pacing ------------------------------------------------
create table if not exists public.app_config (
  id integer primary key default 1,
  daily_cap integer default 30,
  weekly_target_appts integer default 5,
  per_tick integer default 3,
  ticks_per_day integer default 6,
  rate_open numeric,
  rate_reply numeric,
  rate_qualified numeric,
  rate_booked numeric,
  li_batch_cron text default '0 9 * * *',
  li_batch_enabled boolean default false,
  platform_mix jsonb,
  cap_linkedin integer,
  cap_instagram integer,
  cap_facebook integer,
  timezone text,
  ig_business_id text,
  meta_page_token text,
  metadata jsonb,
  updated_at timestamptz default now()
);

insert into public.app_config (id)
values (1)
on conflict (id) do nothing;

-- Simple key/value store for legacy settings -----------------------------------
create table if not exists public.app_settings_kv (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- LinkedIn batch preferences ----------------------------------------------------
create table if not exists public.li_batch_prefs (
  user_id uuid primary key,
  is_enabled boolean default false,
  daily_quota integer default 25,
  schedule_cron text default '0 10 * * *',
  timezone text default 'America/Toronto',
  mode text default 'push',
  updated_at timestamptz default now()
);

-- LinkedIn contact staging ------------------------------------------------------
create table if not exists public.li_contacts_stage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  fingerprint text,
  public_id text,
  profile_url text,
  name text,
  headline text,
  company text,
  title text,
  region text,
  raw jsonb,
  created_at timestamptz default now(),
  processed_at timestamptz
);
alter table if exists public.li_contacts_stage add column if not exists fingerprint text;
create unique index if not exists li_contacts_stage_user_fp_idx on public.li_contacts_stage(user_id, fingerprint) where fingerprint is not null;
create index if not exists li_contacts_stage_user_created_idx on public.li_contacts_stage(user_id, created_at);

-- Prospects captured by SmartDriver + staging loop --------------------------------
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text default 'linkedin',
  name text,
  first_name text,
  last_name text,
  headline text,
  title text,
  company text,
  region text,
  location text,
  public_id text,
  profile_url text,
  li_handle text,
  li_profile_id text,
  score int,
  stage text default 'new',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.prospects add column if not exists profile_url text;
alter table if exists public.prospects add column if not exists li_handle text;
create index if not exists prospects_user_idx on public.prospects(user_id);
create index if not exists prospects_user_stage_idx on public.prospects(user_id, stage);
create unique index if not exists prospects_user_public_idx on public.prospects(user_id, public_id) where public_id is not null;
create unique index if not exists prospects_user_profileurl_idx on public.prospects(user_id, profile_url) where profile_url is not null;
create unique index if not exists prospects_user_lihandle_idx on public.prospects(user_id, li_handle) where li_handle is not null;

-- Leads promoted from prospects -------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prospect_id uuid references public.prospects(id) on delete set null,
  platform text,
  handle text,
  profile_url text,
  username text,
  first_name text,
  last_name text,
  headline text,
  bio text,
  location text,
  city text,
  province text,
  country text default 'Canada',
  tags text[],
  type text,
  open_to_work boolean,
  mutuals int,
  score int,
  quality int default 0,
  status text default 'new',
  do_not_contact boolean default false,
  last_declined_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.leads add column if not exists profile_url text;
alter table if exists public.leads add column if not exists username text;
alter table if exists public.leads add column if not exists city text;
alter table if exists public.leads add column if not exists province text;
alter table if exists public.leads add column if not exists country text default 'Canada';
alter table if exists public.leads add column if not exists tags text[];
alter table if exists public.leads add column if not exists type text;
alter table if exists public.leads add column if not exists quality int default 0;
alter table if exists public.leads add column if not exists do_not_contact boolean default false;
alter table if exists public.leads add column if not exists last_declined_at timestamptz;
alter table if exists public.leads add column if not exists notes text;
create unique index if not exists leads_user_prospect_idx on public.leads(user_id, prospect_id) where prospect_id is not null;
create index if not exists leads_user_status_idx on public.leads(user_id, status);

-- Drafts + approvals ------------------------------------------------------------
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prospect_id uuid references public.prospects(id) on delete cascade,
  platform text,
  li_handle text,
  body text,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists drafts_user_idx on public.drafts(user_id);
create index if not exists drafts_user_prospect_idx on public.drafts(user_id, prospect_id);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  draft_id uuid references public.drafts(id) on delete cascade,
  platform text,
  contact_id uuid,
  to_handle text,
  text text,
  status text default 'pending',
  payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists approvals_user_status_idx on public.approvals(user_id, status);

-- Queue of scheduled messages ---------------------------------------------------
create table if not exists public.queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prospect_id uuid references public.prospects(id) on delete set null,
  draft_id uuid references public.drafts(id) on delete set null,
  platform text,
  channel text,
  body text,
  preview text,
  status text default 'draft',
  scheduled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  error text
);
create index if not exists queue_user_status_idx on public.queue(user_id, status);
create index if not exists queue_user_sched_idx on public.queue(user_id, scheduled_at);

-- Outreach + connect pipeline ----------------------------------------------------
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  platform text default 'linkedin',
  handle text,
  first_name text,
  last_name text,
  headline text,
  location text,
  bio text,
  open_to_work boolean default false,
  mutuals int default 0,
  status text default 'new',
  next_action text,
  note text,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.candidates add column if not exists created_at timestamptz default now();
alter table public.candidates add column if not exists updated_at timestamptz default now();
create unique index if not exists candidates_platform_handle_idx on public.candidates(platform, handle) where handle is not null;
create index if not exists candidates_status_idx on public.candidates(status);

create table if not exists public.connect_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  platform text default 'linkedin',
  handle text,
  profile_url text,
  note text,
  status text default 'queued',
  scheduled_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.connect_queue add column if not exists created_at timestamptz default now();
alter table public.connect_queue add column if not exists updated_at timestamptz default now();
create index if not exists connect_queue_status_idx on public.connect_queue(status);
create index if not exists connect_queue_platform_idx on public.connect_queue(platform);

create table if not exists public.connect_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  platform text default 'linkedin',
  handle text,
  action text,
  ok boolean,
  error text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.connect_log add column if not exists created_at timestamptz default now();
create index if not exists connect_log_platform_created_idx on public.connect_log(platform, created_at desc);

-- Helper trigger to bump updated_at ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_prospects_updated
  before update on public.prospects
  for each row execute function public.set_updated_at();

create trigger trg_leads_updated
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger trg_drafts_updated
  before update on public.drafts
  for each row execute function public.set_updated_at();

create trigger trg_approvals_updated
  before update on public.approvals
  for each row execute function public.set_updated_at();

create trigger trg_queue_updated
  before update on public.queue
  for each row execute function public.set_updated_at();

create trigger trg_candidates_updated
  before update on public.candidates
  for each row execute function public.set_updated_at();

create trigger trg_connect_queue_updated
  before update on public.connect_queue
  for each row execute function public.set_updated_at();

create trigger trg_app_settings_kv_updated
  before update on public.app_settings_kv
  for each row execute function public.set_updated_at();

create trigger trg_app_config_updated
  before update on public.app_config
  for each row execute function public.set_updated_at();

create trigger trg_li_batch_prefs_updated
  before update on public.li_batch_prefs
  for each row execute function public.set_updated_at();

-- SmartDriver RPC: claim staged LinkedIn contacts -------------------------------
create or replace function public.li_stage_for_user(p_user_id uuid, p_limit int default 25)
returns table (
  id uuid,
  user_id uuid,
  name text,
  headline text,
  company text,
  title text,
  region text,
  public_id text,
  profile_url text,
  created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  with grabbed as (
    select s.id
    from public.li_contacts_stage s
    where s.user_id = p_user_id
      and s.processed_at is null
    order by s.created_at asc
    limit coalesce(p_limit, 25)
    for update skip locked
  )
  update public.li_contacts_stage s
     set processed_at = now()
   where s.id in (select id from grabbed)
  returning s.id, s.user_id, s.name, s.headline, s.company, s.title, s.region, s.public_id, s.profile_url, s.created_at;
end;
$$;

-- Row level security ------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.app_config enable row level security;
alter table public.app_settings_kv enable row level security;
alter table public.li_batch_prefs enable row level security;
alter table public.li_contacts_stage enable row level security;
alter table public.prospects enable row level security;
alter table public.leads enable row level security;
alter table public.drafts enable row level security;
alter table public.approvals enable row level security;
alter table public.queue enable row level security;
alter table public.candidates enable row level security;
alter table public.connect_queue enable row level security;
alter table public.connect_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'app_settings_all_rw') then
    create policy app_settings_all_rw on public.app_settings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'app_config_all_rw') then
    create policy app_config_all_rw on public.app_config for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'app_settings_kv_all_rw') then
    create policy app_settings_kv_all_rw on public.app_settings_kv for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'li_batch_prefs_all_rw') then
    create policy li_batch_prefs_all_rw on public.li_batch_prefs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'li_contacts_stage_all_rw') then
    create policy li_contacts_stage_all_rw on public.li_contacts_stage for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'prospects_all_rw') then
    create policy prospects_all_rw on public.prospects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'leads_all_rw') then
    create policy leads_all_rw on public.leads for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'drafts_all_rw') then
    create policy drafts_all_rw on public.drafts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'approvals_all_rw') then
    create policy approvals_all_rw on public.approvals for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'queue_all_rw') then
    create policy queue_all_rw on public.queue for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'candidates_all_rw') then
    create policy candidates_all_rw on public.candidates for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'connect_queue_all_rw') then
    create policy connect_queue_all_rw on public.connect_queue for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'connect_log_all_rw') then
    create policy connect_log_all_rw on public.connect_log for all using (true) with check (true);
  end if;
end
$$;
