create extension if not exists pgcrypto;

create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz default now()
);
