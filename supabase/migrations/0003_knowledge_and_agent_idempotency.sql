alter table public.agent_runs add constraint agent_runs_message_unique unique (message_id);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_type text not null,
  source_id text,
  title text not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, source_type, source_id)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_search_idx on public.knowledge_chunks using gin(search_vector);
create index knowledge_chunks_business_idx on public.knowledge_chunks (business_id, document_id);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
create policy knowledge_documents_business_access on public.knowledge_documents for all using (public.user_has_business_access(business_id));
create policy knowledge_chunks_business_access on public.knowledge_chunks for all using (public.user_has_business_access(business_id));

create or replace function public.search_knowledge(target_business_id uuid, search_query text, result_limit integer default 8)
returns table(chunk_id uuid, document_id uuid, content text, rank real)
language sql
stable
as $$
  select kc.id, kc.document_id, kc.content, ts_rank(kc.search_vector, plainto_tsquery('english', search_query)) as rank
  from public.knowledge_chunks kc
  where kc.business_id = target_business_id
    and kc.search_vector @@ plainto_tsquery('english', search_query)
  order by rank desc
  limit greatest(1, least(result_limit, 20));
$$;
