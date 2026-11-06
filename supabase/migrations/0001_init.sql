create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  location text not null,
  location_key text not null,
  business_type text not null,
  quantity int not null check (quantity > 0),
  criteria jsonb not null,
  status text not null default 'buscando' check (status in ('buscando', 'analisando', 'concluido', 'erro')),
  error text,
  apify_run_id text,
  instagram_run_id text
);
create index batches_location_key_idx on batches (location_key);

create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  batch_id uuid references batches (id) on delete set null,
  place_id text not null unique,
  name text not null,
  business_type text,
  phone_raw text,
  phone_e164 text,
  address text,
  city text,
  is_open boolean not null default true,
  rating numeric,
  reviews_count int not null default 0,
  images_count int not null default 0,
  description text,
  categories text[] not null default '{}',
  photos text[] not null default '{}',
  reviews jsonb not null default '[]',
  website_url text,
  instagram_url text,
  instagram_last_post_at timestamptz,
  site_status text check (site_status in ('sem_link', 'somente_social', 'fora_do_ar', 'funcionando')),
  site_checks jsonb not null default '[]',
  site_data jsonb,
  site_signals jsonb,
  flow text check (flow in ('sem_site', 'melhorar_site')),
  summary text,
  reason text,
  comment text,
  score int,
  score_reasons jsonb,
  stage text not null default 'analisando' check (stage in (
    'analisando', 'revisar', 'gerando_material', 'revisar_material', 'abordar', 'aguardando',
    'follow_up_feito', 'conversa', 'vendido', 'descartado', 'sem_interesse', 'nao_contatar'
  )),
  exit_reason text,
  needs_data boolean not null default false,
  error text,
  contacted_at timestamptz,
  follow_up_at timestamptz,
  responded_at timestamptz,
  sold_at timestamptz
);
create index leads_batch_stage_idx on leads (batch_id, stage);
create index leads_phone_idx on leads (phone_e164);
create trigger leads_updated_at before update on leads for each row execute function set_updated_at();

create table sites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  slug text not null unique,
  content jsonb not null,
  status text not null default 'modelo' check (status in ('modelo', 'removido')),
  expires_at timestamptz not null
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  status text not null default 'na_fila' check (status in ('na_fila', 'renderizando', 'pronto', 'erro')),
  progress int not null default 0,
  storage_path text,
  duration_seconds numeric,
  error text
);

-- Fila genérica: novos workers só precisam tratar novos valores de `type`.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  status text not null default 'pendente' check (status in ('pendente', 'executando', 'concluido', 'erro')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  error text,
  locked_at timestamptz
);
create index jobs_pending_idx on jobs (run_after) where status = 'pendente';

create table events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references leads (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'
);
create index events_lead_idx on events (lead_id, created_at desc);
create index events_type_idx on events (type, created_at desc);

create table do_not_contact (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_e164 text unique,
  place_id text unique,
  reason text
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid unique references leads (id) on delete set null,
  legal_name text not null,
  document text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  location text,
  asaas_customer_id text
);

create table services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('unico', 'recorrente')),
  amount_cents int not null check (amount_cents >= 0),
  start_date date not null,
  notes text,
  status text not null default 'ativo' check (status in ('ativo', 'concluido', 'cancelado')),
  asaas_subscription_id text unique
);
create index services_client_idx on services (client_id);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_id uuid not null unique references services (id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'assinado', 'recusado')),
  zapsign_doc_token text unique,
  sign_url text,
  file_url text,
  status_at timestamptz not null default now()
);

create table charges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_id uuid not null references services (id) on delete cascade,
  description text not null,
  amount_cents int not null check (amount_cents >= 0),
  due_date date not null,
  method text not null check (method in ('pix', 'boleto', 'cartao')),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'vencido', 'cancelado')),
  payment_url text,
  asaas_payment_id text unique
);
create index charges_service_idx on charges (service_id);

-- Entrega cada tarefa a um único worker e devolve as abandonadas há mais de 30 minutos.
create or replace function claim_next_job() returns setof jobs language plpgsql as $$
begin
  update jobs set status = 'pendente', locked_at = null
    where status = 'executando' and locked_at < now() - interval '30 minutes';
  return query
    update jobs set status = 'executando', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'pendente' and run_after <= now()
      order by run_after
      limit 1
      for update skip locked
    )
    returning *;
end $$;
revoke all on function claim_next_job() from public, anon, authenticated;
grant execute on function claim_next_job() to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'batches', 'leads', 'sites', 'videos', 'jobs', 'events', 'do_not_contact',
    'clients', 'services', 'contracts', 'charges'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_authenticated', t);
    execute format('grant all on %I to authenticated, service_role', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
