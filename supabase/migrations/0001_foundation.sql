create extension if not exists pgcrypto;

create type public.risk_level as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'EDITED', 'EXPIRED');
create type public.thread_status as enum ('OPEN', 'WAITING_ON_CUSTOMER', 'WAITING_ON_TEAM', 'RESOLVED', 'ESCALATED');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MEMBER', 'REVIEWER')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  ai_active boolean not null default false,
  auto_send_active boolean not null default false,
  autonomy_level smallint not null default 0 check (autonomy_level between 0 and 3),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('GMAIL', 'MICROSOFT')),
  email_address text not null,
  ai_active boolean not null default false,
  auto_send_active boolean not null default false,
  provider_account_id text,
  watch_expires_at timestamptz,
  last_history_id text,
  created_at timestamptz not null default now(),
  unique (business_id, email_address)
);

create table public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid references public.mailboxes(id) on delete cascade,
  provider text not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ghl_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  location_id text not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ghl_contact_id text,
  email text,
  first_name text,
  last_name text,
  crm_snapshot jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, ghl_contact_id)
);

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  provider_thread_id text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  subject text,
  status public.thread_status not null default 'OPEN',
  risk public.risk_level,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (mailbox_id, provider_thread_id)
);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  provider_message_id text not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz,
  sent_at timestamptz,
  raw_headers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (mailbox_id, provider_message_id)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete cascade,
  message_id uuid references public.email_messages(id) on delete cascade,
  prompt_version text,
  model text,
  triage jsonb,
  decision jsonb,
  draft jsonb,
  confidence numeric(5,4),
  risk public.risk_level,
  status text not null default 'STARTED',
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(12,6),
  error jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  status public.approval_status not null default 'PENDING',
  risk public.risk_level not null,
  proposed_action jsonb not null,
  proposed_draft jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.business_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  conditions jsonb not null,
  actions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete cascade,
  action_type text not null,
  payload jsonb not null,
  run_at timestamptz not null,
  cancel_condition text not null default 'NEW_INBOUND_MESSAGE',
  status text not null default 'SCHEDULED',
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid references public.mailboxes(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  details jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index audit_events_idempotency_idx
  on public.audit_events (business_id, idempotency_key)
  where idempotency_key is not null;

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.businesses enable row level security;
alter table public.mailboxes enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.ghl_connections enable row level security;
alter table public.contacts enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.business_rules enable row level security;
alter table public.scheduled_actions enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.user_has_business_access(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    join public.organization_users ou on ou.organization_id = b.organization_id
    where b.id = target_business_id
      and ou.user_id = auth.uid()
  );
$$;

create policy businesses_member_access on public.businesses
for all using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = businesses.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy mailboxes_business_access on public.mailboxes
for all using (public.user_has_business_access(business_id));
create policy contacts_business_access on public.contacts
for all using (public.user_has_business_access(business_id));
create policy email_threads_business_access on public.email_threads
for all using (public.user_has_business_access(business_id));
create policy email_messages_business_access on public.email_messages
for all using (public.user_has_business_access(business_id));
create policy agent_runs_business_access on public.agent_runs
for all using (public.user_has_business_access(business_id));
create policy approvals_business_access on public.approvals
for all using (public.user_has_business_access(business_id));
create policy business_rules_business_access on public.business_rules
for all using (public.user_has_business_access(business_id));
create policy scheduled_actions_business_access on public.scheduled_actions
for all using (public.user_has_business_access(business_id));
create policy audit_events_business_access on public.audit_events
for all using (public.user_has_business_access(business_id));
create policy oauth_connections_business_access on public.oauth_connections
for all using (public.user_has_business_access(business_id));
create policy ghl_connections_business_access on public.ghl_connections
for all using (public.user_has_business_access(business_id));
