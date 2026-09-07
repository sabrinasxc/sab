create type public.outreach_status as enum (
  'READY_TO_SEND',
  'SENT',
  'FOLLOWUP_DUE',
  'REPLIED',
  'INTERESTED',
  'BOOKED',
  'NOT_INTERESTED',
  'CLOSED'
);

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  name text not null,
  channel text not null default 'EMAIL' check (channel = 'EMAIL'),
  mode text not null default 'VA_REVIEW' check (mode in ('VA_REVIEW', 'AUTOPILOT')),
  max_followups smallint not null default 2 check (max_followups between 0 and 5),
  followup_delay_days smallint not null default 4 check (followup_delay_days between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  contact_name text not null,
  email text not null,
  organization text,
  outlet_type text check (outlet_type in ('PODCAST', 'EVENT', 'RADIO', 'TV', 'OTHER')),
  subject text not null,
  body_text text not null,
  status public.outreach_status not null default 'READY_TO_SEND',
  provider_thread_id text,
  provider_message_id text,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  last_reply_at timestamptz,
  followup_count smallint not null default 0,
  next_followup_at timestamptz,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index outreach_contacts_due_idx
  on public.outreach_contacts (next_followup_at)
  where status = 'FOLLOWUP_DUE';

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_contacts enable row level security;

create policy outreach_campaigns_business_access
on public.outreach_campaigns
for all
using (public.user_has_business_access(business_id))
with check (public.user_has_business_access(business_id));

create policy outreach_contacts_business_access
on public.outreach_contacts
for all
using (public.user_has_business_access(business_id))
with check (public.user_has_business_access(business_id));
