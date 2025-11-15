create extension if not exists pgcrypto;

-- Application + OAuth settings -------------------------------------------------
create table if not exists public.app_settings (
  user_id uuid primary key,
  status text default 'active',
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

alter table if exists public.app_settings add column if not exists status text default 'active';

do $$
declare
  has_user_id boolean;
  has_id boolean;
  pk_name text;
  pk_cols text;
  null_count bigint;
begin
  select exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'app_settings'
             and column_name = 'user_id'
         ),
         exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'app_settings'
             and column_name = 'id'
         )
    into has_user_id, has_id;

  if not has_user_id then
    if has_id then
      alter table public.app_settings rename column id to user_id;
      has_user_id := true;
      has_id := false;
    else
      alter table public.app_settings add column user_id uuid;
      has_user_id := true;
    end if;
  end if;

  if has_user_id and has_id then
    update public.app_settings set user_id = id where user_id is null;
  end if;

  select conname,
         string_agg(att.attname, ',' order by cols.ord) as cols
    into pk_name, pk_cols
    from pg_constraint con
    join unnest(con.conkey) with ordinality as cols(attnum, ord) on true
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = cols.attnum
    where con.conrelid = 'public.app_settings'::regclass
      and con.contype = 'p'
    group by conname;

  if pk_name is not null and pk_cols <> 'user_id' then
    execute format('alter table public.app_settings drop constraint %I', pk_name);
  end if;

  if has_user_id then
    select count(*)
      into null_count
      from public.app_settings
      where user_id is null;

    if null_count = 0 then
      alter table public.app_settings alter column user_id set not null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.app_settings'::regclass
        and contype = 'p'
    ) then
      alter table public.app_settings add primary key (user_id);
    end if;
  end if;
end $$;

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
alter table if exists public.li_contacts_stage add column if not exists public_id text;
alter table if exists public.li_contacts_stage add column if not exists profile_url text;
alter table if exists public.li_contacts_stage add column if not exists name text;
alter table if exists public.li_contacts_stage add column if not exists headline text;
alter table if exists public.li_contacts_stage add column if not exists company text;
alter table if exists public.li_contacts_stage add column if not exists title text;
alter table if exists public.li_contacts_stage add column if not exists region text;
alter table if exists public.li_contacts_stage add column if not exists raw jsonb;
alter table if exists public.li_contacts_stage add column if not exists created_at timestamptz default now();
alter table if exists public.li_contacts_stage add column if not exists processed_at timestamptz;
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
alter table if exists public.prospects add column if not exists handle text;
alter table if exists public.prospects add column if not exists platform text default 'linkedin';
alter table if exists public.prospects add column if not exists status text;
alter table if exists public.prospects add column if not exists dnc boolean default false;
alter table if exists public.prospects add column if not exists dnc_reason text;
alter table if exists public.prospects add column if not exists profile_urls text[];
alter table if exists public.prospects add column if not exists links jsonb;
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
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'prospect_id'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prospects'
        and column_name = 'id'
        and udt_name = 'uuid'
    ) then
      execute 'alter table public.leads add column prospect_id uuid references public.prospects(id) on delete set null';
    else
      execute 'alter table public.leads add column prospect_id integer';
    end if;
  end if;
end
$$;
alter table if exists public.leads add column if not exists status text default 'new';
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
alter table if exists public.leads add column if not exists full_name text;
alter table if exists public.leads add column if not exists title text;
alter table if exists public.leads add column if not exists company text;
alter table if exists public.leads add column if not exists email text;
alter table if exists public.leads add column if not exists phone text;
alter table if exists public.leads add column if not exists source text;
alter table if exists public.leads add column if not exists li_profile_id text;
alter table if exists public.leads add column if not exists li_handle text;
alter table if exists public.leads add column if not exists stage text;
alter table if exists public.leads add column if not exists track text;
alter table if exists public.leads add column if not exists confidence numeric;
alter table if exists public.leads add column if not exists cool_off_until timestamptz;
alter table if exists public.leads add column if not exists next_touch_at timestamptz;
alter table if exists public.leads add column if not exists last_reply_at timestamptz;
alter table if exists public.leads add column if not exists last_contact_at timestamptz;
alter table if exists public.leads add column if not exists last_contact_channel text;
alter table if exists public.leads add column if not exists birthday date;
alter table if exists public.leads add column if not exists persona text;
alter table if exists public.leads add column if not exists external_id text;
alter table if exists public.leads add column if not exists workspace_id uuid;
alter table if exists public.leads add column if not exists owner_id uuid;
alter table if exists public.leads add column if not exists pipeline text;
alter table if exists public.leads add column if not exists priority integer;
drop index if exists leads_user_prospect_idx;
alter table if exists public.leads
  add constraint leads_user_prospect_unique unique (user_id, prospect_id);
create index if not exists leads_user_prospect_lookup_idx on public.leads(user_id, prospect_id);
create index if not exists leads_user_status_idx on public.leads(user_id, status);
create index if not exists leads_user_stage_idx on public.leads(user_id, stage);
create index if not exists leads_user_track_idx on public.leads(user_id, track);

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
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'drafts'
      and column_name = 'prospect_id'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prospects'
        and column_name = 'id'
        and udt_name = 'uuid'
    ) then
      execute 'alter table public.drafts add column prospect_id uuid references public.prospects(id) on delete cascade';
    else
      execute 'alter table public.drafts add column prospect_id integer';
    end if;
  end if;
end
$$;
alter table if exists public.drafts add column if not exists status text default 'draft';
alter table if exists public.drafts add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table if exists public.drafts add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table if exists public.drafts add column if not exists track text;
alter table if exists public.drafts add column if not exists preview text;
alter table if exists public.drafts add column if not exists scheduled_at timestamptz;
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
alter table if exists public.approvals add column if not exists status text default 'pending';
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
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'queue'
      and column_name = 'prospect_id'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prospects'
        and column_name = 'id'
        and udt_name = 'uuid'
    ) then
      execute 'alter table public.queue add column prospect_id uuid references public.prospects(id) on delete set null';
    else
      execute 'alter table public.queue add column prospect_id integer';
    end if;
  end if;
end
$$;
alter table if exists public.queue add column if not exists status text default 'draft';
alter table if exists public.queue add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table if exists public.queue add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table if exists public.queue add column if not exists provider text;
alter table if exists public.queue add column if not exists li_profile_id text;
alter table if exists public.queue add column if not exists to_name text;
alter table if exists public.queue add column if not exists message text;
alter table if exists public.queue add column if not exists track text;
alter table if exists public.queue add column if not exists kind text;
alter table if exists public.queue add column if not exists payload jsonb;
alter table if exists public.queue add column if not exists meta jsonb;
alter table if exists public.queue add column if not exists sent_at timestamptz;
alter table if exists public.queue add column if not exists campaign text;
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
alter table if exists public.candidates add column if not exists status text default 'new';
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
alter table if exists public.connect_queue add column if not exists status text default 'queued';
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

-- Accounts + connection tokens -------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  provider_account_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.accounts add column if not exists metadata jsonb;
alter table if exists public.accounts add column if not exists updated_at timestamptz default now();
create index if not exists accounts_user_idx on public.accounts(user_id);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  platform text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.connections add column if not exists meta jsonb;
alter table if exists public.connections add column if not exists updated_at timestamptz default now();
create unique index if not exists connections_user_platform_idx on public.connections(user_id, platform);

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz default now()
);
alter table if exists public.credentials add column if not exists workspace_id uuid;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  external_id text not null,
  status text default 'new',
  payload jsonb,
  created_at timestamptz default now()
);
create unique index if not exists imports_platform_external_idx on public.imports(platform, external_id);

create table if not exists public.inbound_dedup (
  id text primary key,
  source text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  company text,
  persona text,
  calendly_url text,
  timezone text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.profiles add column if not exists metadata jsonb;
alter table if exists public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  name text,
  created_at timestamptz default now()
);

create table if not exists public.settings (
  id integer primary key default 1,
  story_reply_fallback_hours integer default 48,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.stats_hot_hours (
  hour integer primary key,
  score numeric,
  updated_at timestamptz default now()
);

create table if not exists public.webinar_events (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  display_name text,
  framing text,
  schedule jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Contacts + interaction memory ------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  platform text default 'linkedin',
  handle text,
  external_id text,
  persona text,
  name text,
  first_name text,
  last_name text,
  headline text,
  location text,
  city text,
  region text,
  country text,
  stage text default 'prospect',
  status text default 'new',
  tags text[],
  note text,
  last_note text,
  profile_urls text[],
  links jsonb,
  bio text,
  open_to_work boolean,
  do_not_contact boolean default false,
  dnc_reason text,
  last_interaction_at timestamptz,
  last_reply_at timestamptz,
  source text,
  ig_uid text,
  psid text,
  email text,
  phone text,
  workspace_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.contacts add column if not exists tags text[];
alter table if exists public.contacts add column if not exists profile_urls text[];
alter table if exists public.contacts add column if not exists links jsonb;
alter table if exists public.contacts add column if not exists bio text;
alter table if exists public.contacts add column if not exists open_to_work boolean;
alter table if exists public.contacts add column if not exists do_not_contact boolean default false;
alter table if exists public.contacts add column if not exists dnc_reason text;
alter table if exists public.contacts add column if not exists last_interaction_at timestamptz;
alter table if exists public.contacts add column if not exists last_reply_at timestamptz;
alter table if exists public.contacts add column if not exists ig_uid text;
alter table if exists public.contacts add column if not exists psid text;
alter table if exists public.contacts add column if not exists workspace_id uuid;
create unique index if not exists contacts_platform_handle_idx on public.contacts(platform, handle) where handle is not null;
create index if not exists contacts_platform_country_idx on public.contacts(platform, country);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  platform text,
  type text,
  direction text,
  body text,
  meta jsonb,
  created_at timestamptz default now()
);
alter table if exists public.interactions add column if not exists meta jsonb;

create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  kind text,
  platform text,
  note text,
  at timestamptz default now(),
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.timeline (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  kind text,
  detail text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Messaging + replies ----------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  platform text,
  track text,
  kind text,
  channel text,
  target_url text,
  post_excerpt text,
  body text,
  preview text,
  status text default 'draft',
  approved boolean default false,
  scheduled_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  paused_at timestamptz,
  error text,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.messages add column if not exists preview text;
alter table if exists public.messages add column if not exists approved boolean default false;
alter table if exists public.messages add column if not exists approved_at timestamptz;
alter table if exists public.messages add column if not exists sent_at timestamptz;
alter table if exists public.messages add column if not exists meta jsonb;
create index if not exists messages_lead_idx on public.messages(lead_id);
create index if not exists messages_status_idx on public.messages(status);

create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  platform text,
  text text,
  from_lead boolean default true,
  user_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sent_log (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.queue(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  platform text,
  user_id uuid,
  contact_id uuid,
  lead_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  endpoint text,
  keys jsonb,
  p256dh text,
  auth text,
  raw jsonb,
  created_at timestamptz default now()
);

-- Conversation memory ----------------------------------------------------------
create table if not exists public.conv_threads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  platform text,
  persona text,
  state text,
  priority integer default 0,
  sentiment text,
  engagement_count integer default 0,
  replies integer default 0,
  last_event_at timestamptz,
  last_offer text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table if exists public.conv_threads add column if not exists metadata jsonb;

create table if not exists public.conv_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.conv_threads(id) on delete cascade,
  role text,
  text text,
  sentiment text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Templates + AB testing -------------------------------------------------------
create table if not exists public.msg_templates (
  id uuid primary key default gen_random_uuid(),
  name text,
  platform text,
  persona text,
  body text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.msg_variants (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.msg_templates(id) on delete cascade,
  body text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.ab_variants (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  label text,
  body text,
  payload jsonb,
  trials integer default 0,
  wins integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists ab_variants_slot_idx on public.ab_variants(slot);

-- Logging ----------------------------------------------------------------------
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  level text,
  scope text,
  detail text,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  method text,
  path text,
  status integer,
  duration_ms integer,
  ip text,
  headers jsonb,
  body jsonb,
  created_at timestamptz default now()
);

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

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_prospects_updated'
  ) then
    create trigger trg_prospects_updated
      before update on public.prospects
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_leads_updated'
  ) then
    create trigger trg_leads_updated
      before update on public.leads
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_drafts_updated'
  ) then
    create trigger trg_drafts_updated
      before update on public.drafts
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_approvals_updated'
  ) then
    create trigger trg_approvals_updated
      before update on public.approvals
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_queue_updated'
  ) then
    create trigger trg_queue_updated
      before update on public.queue
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_candidates_updated'
  ) then
    create trigger trg_candidates_updated
      before update on public.candidates
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_connect_queue_updated'
  ) then
    create trigger trg_connect_queue_updated
      before update on public.connect_queue
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_app_settings_kv_updated'
  ) then
    create trigger trg_app_settings_kv_updated
      before update on public.app_settings_kv
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_app_config_updated'
  ) then
    create trigger trg_app_config_updated
      before update on public.app_config
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_li_batch_prefs_updated'
  ) then
    create trigger trg_li_batch_prefs_updated
      before update on public.li_batch_prefs
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_accounts_updated'
  ) then
    create trigger trg_accounts_updated
      before update on public.accounts
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_connections_updated'
  ) then
    create trigger trg_connections_updated
      before update on public.connections
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_contacts_updated'
  ) then
    create trigger trg_contacts_updated
      before update on public.contacts
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_messages_updated'
  ) then
    create trigger trg_messages_updated
      before update on public.messages
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_conv_threads_updated'
  ) then
    create trigger trg_conv_threads_updated
      before update on public.conv_threads
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_profiles_updated'
  ) then
    create trigger trg_profiles_updated
      before update on public.profiles
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_settings_updated'
  ) then
    create trigger trg_settings_updated
      before update on public.settings
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- SmartDriver RPC: claim staged LinkedIn contacts -------------------------------
drop function if exists public.li_stage_for_user(uuid, integer);

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
    select s.id as stage_id
    from public.li_contacts_stage s
    where s.user_id = p_user_id
      and s.processed_at is null
    order by s.created_at asc
    limit coalesce(p_limit, 25)
    for update skip locked
  )
  update public.li_contacts_stage s
     set processed_at = now()
    from grabbed g
   where s.id = g.stage_id
  returning s.id, s.user_id, s.name, s.headline, s.company, s.title, s.region, s.public_id, s.profile_url, s.created_at;
end;
$$;

drop function if exists public.contacts_unanswered(text[], text, integer, integer);

create or replace function public.contacts_unanswered(
  p_platforms text[] default array['linkedin'],
  p_country text default null,
  p_days integer default 30,
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  platform text,
  handle text,
  stage text,
  tags text[],
  country text,
  created_at timestamptz
)
language sql
as $$
  with last_inbound as (
    select contact_id, max(created_at) as last_reply
      from public.interactions
     where direction = 'inbound'
     group by contact_id
  )
  select c.id, c.name, c.platform, c.handle, c.stage, c.tags, c.country, c.created_at
    from public.contacts c
    left join last_inbound li on li.contact_id = c.id
   where coalesce(c.do_not_contact, false) = false
     and (p_country is null or c.country = p_country)
     and (coalesce(p_platforms, array['linkedin']) is null or c.platform = any(p_platforms))
     and (
       li.last_reply is null or
       li.last_reply < now() - make_interval(days => greatest(1, coalesce(p_days, 30)))
     )
   order by coalesce(li.last_reply, c.created_at) asc
   limit greatest(1, coalesce(p_limit, 10));
$$;

create or replace function public.ab_inc_trials(vid uuid)
returns void
language sql
as $$ update public.ab_variants set trials = trials + 1 where id = vid $$;

create or replace function public.ab_inc_wins(vid uuid)
returns void
language sql
as $$ update public.ab_variants set wins = wins + 1 where id = vid $$;

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
alter table public.accounts enable row level security;
alter table public.connections enable row level security;
alter table public.credentials enable row level security;
alter table public.imports enable row level security;
alter table public.inbound_dedup enable row level security;
alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.stats_hot_hours enable row level security;
alter table public.webinar_events enable row level security;
alter table public.contacts enable row level security;
alter table public.interactions enable row level security;
alter table public.contact_events enable row level security;
alter table public.timeline enable row level security;
alter table public.messages enable row level security;
alter table public.replies enable row level security;
alter table public.sent_log enable row level security;
alter table public.push_subs enable row level security;
alter table public.conv_threads enable row level security;
alter table public.conv_messages enable row level security;
alter table public.msg_templates enable row level security;
alter table public.msg_variants enable row level security;
alter table public.ab_variants enable row level security;
alter table public.logs enable row level security;
alter table public.request_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'app_settings_all_rw') then
    create policy app_settings_all_rw on public.app_settings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'app_config_all_rw') then
    create policy app_config_all_rw on public.app_config for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'app_settings_kv_all_rw') then
    create policy app_settings_kv_all_rw on public.app_settings_kv for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'li_batch_prefs_all_rw') then
    create policy li_batch_prefs_all_rw on public.li_batch_prefs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'li_contacts_stage_all_rw') then
    create policy li_contacts_stage_all_rw on public.li_contacts_stage for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'prospects_all_rw') then
    create policy prospects_all_rw on public.prospects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'leads_all_rw') then
    create policy leads_all_rw on public.leads for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'drafts_all_rw') then
    create policy drafts_all_rw on public.drafts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'approvals_all_rw') then
    create policy approvals_all_rw on public.approvals for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'queue_all_rw') then
    create policy queue_all_rw on public.queue for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'candidates_all_rw') then
    create policy candidates_all_rw on public.candidates for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'connect_queue_all_rw') then
    create policy connect_queue_all_rw on public.connect_queue for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'connect_log_all_rw') then
    create policy connect_log_all_rw on public.connect_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'accounts_all_rw') then
    create policy accounts_all_rw on public.accounts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'connections_all_rw') then
    create policy connections_all_rw on public.connections for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'credentials_all_rw') then
    create policy credentials_all_rw on public.credentials for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'imports_all_rw') then
    create policy imports_all_rw on public.imports for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'inbound_dedup_all_rw') then
    create policy inbound_dedup_all_rw on public.inbound_dedup for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'profiles_all_rw') then
    create policy profiles_all_rw on public.profiles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'users_all_rw') then
    create policy users_all_rw on public.users for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'settings_all_rw') then
    create policy settings_all_rw on public.settings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'stats_hot_hours_all_rw') then
    create policy stats_hot_hours_all_rw on public.stats_hot_hours for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'webinar_events_all_rw') then
    create policy webinar_events_all_rw on public.webinar_events for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'contacts_all_rw') then
    create policy contacts_all_rw on public.contacts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'interactions_all_rw') then
    create policy interactions_all_rw on public.interactions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'contact_events_all_rw') then
    create policy contact_events_all_rw on public.contact_events for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'timeline_all_rw') then
    create policy timeline_all_rw on public.timeline for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'messages_all_rw') then
    create policy messages_all_rw on public.messages for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'replies_all_rw') then
    create policy replies_all_rw on public.replies for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sent_log_all_rw') then
    create policy sent_log_all_rw on public.sent_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'push_subs_all_rw') then
    create policy push_subs_all_rw on public.push_subs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'conv_threads_all_rw') then
    create policy conv_threads_all_rw on public.conv_threads for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'conv_messages_all_rw') then
    create policy conv_messages_all_rw on public.conv_messages for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'msg_templates_all_rw') then
    create policy msg_templates_all_rw on public.msg_templates for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'msg_variants_all_rw') then
    create policy msg_variants_all_rw on public.msg_variants for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ab_variants_all_rw') then
    create policy ab_variants_all_rw on public.ab_variants for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'logs_all_rw') then
    create policy logs_all_rw on public.logs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'request_logs_all_rw') then
    create policy request_logs_all_rw on public.request_logs for all using (true) with check (true);
  end if;
end
$$;
