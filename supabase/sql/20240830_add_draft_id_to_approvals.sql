-- Ensure approvals rows reference originating drafts and refresh schema cache
alter table public.approvals
  add column if not exists draft_id uuid references public.drafts(id) on delete cascade;

create index if not exists approvals_draft_idx on public.approvals(draft_id);

-- Refresh PostgREST schema cache so draft_id is visible to the API layer
notify pgrst, 'reload schema';
