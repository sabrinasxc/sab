alter table public.approvals
  add column if not exists provider_draft_id text,
  add column if not exists provider_draft_message_id text;

create index if not exists approvals_provider_draft_id_idx
  on public.approvals (provider_draft_id)
  where provider_draft_id is not null;
