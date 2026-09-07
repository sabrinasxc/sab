alter table public.oauth_connections add constraint oauth_connections_mailbox_provider_unique unique (mailbox_id, provider);

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;

create policy organizations_member_access on public.organizations
for select using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = organizations.id and ou.user_id = auth.uid()
  )
);

create policy organization_users_self_read on public.organization_users
for select using (user_id = auth.uid());

alter table public.email_messages add column if not exists processing_status text not null default 'PENDING';
alter table public.email_messages add column if not exists processed_at timestamptz;
create index if not exists email_messages_pending_idx on public.email_messages (business_id, processing_status, created_at);
create index if not exists email_threads_activity_idx on public.email_threads (business_id, last_activity_at desc);
create index if not exists approvals_pending_idx on public.approvals (business_id, status, created_at desc);
