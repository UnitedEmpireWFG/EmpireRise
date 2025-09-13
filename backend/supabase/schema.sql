create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  full_name text,
  email text,
  role text check (role in ('owner','member')) default 'owner',
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  full_name text,
  platform text check (platform in ('linkedin','instagram','facebook','x','tiktok','youtube','email','phone','threads','reddit')),
  profile_url text,
  username text,
  city text,
  province text,
  country text default 'Canada',
  tags text[],
  type text check (type in ('client','recruit','unclear')) default 'unclear',
  quality int default 0,
  status text check (status in ('new','warming','queued','messaged','booked','paused','do_not_contact')) default 'new',
  do_not_contact boolean default false,
  last_declined_at timestamptz,
  notes text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  platform text,
  direction text check (direction in ('out','in')),
  content text,
  status text check (status in ('draft','queued','sent','failed')),
  approved boolean default false,
  scheduled_at timestamptz,
  batch_id text,
  meta jsonb
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  calendly_event_id text,
  kind text check (kind in ('client','recruit','webinar'))
);

create index if not exists leads_country_idx on leads((lower(country)));
create index if not exists leads_province_idx on leads((lower(province)));
create index if not exists leads_type_idx on leads((lower(type)));
create index if not exists leads_username_idx on leads(username);
create index if not exists leads_profileurl_idx on leads(profile_url);
