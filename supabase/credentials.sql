create extension if not exists pgcrypto;

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  data jsonb,
  created_at timestamptz default now()
);

create index if not exists credentials_provider_idx on public.credentials(provider);
create index if not exists credentials_workspace_idx on public.credentials(workspace_id);
