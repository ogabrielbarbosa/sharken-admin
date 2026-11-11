-- v2: material completo, CRM com WhatsApp, contrato e pagamento.

-- Etapas novas. Os valores antigos continuam aceitos até a conversão no fim do arquivo.
alter table leads drop constraint leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in (
  'analisando', 'revisar', 'completar', 'gerando_material', 'revisar_material', 'abordar', 'aguardando',
  'follow_up_feito', 'conversa', 'vendido', 'crm', 'descartado', 'sem_interesse', 'nao_contatar'
));

create table lead_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references leads (id) on delete cascade,
  kind text not null check (kind in ('link', 'arquivo', 'texto')),
  label text,
  url text,
  storage_path text,
  mime_type text,
  body text,
  extracted_text text,
  extracted_images text[] not null default '{}',
  status text not null default 'extraindo' check (status in ('extraindo', 'pronto', 'erro')),
  error text
);
create index lead_assets_lead_idx on lead_assets (lead_id);

alter table sites
  add column generator text not null default 'template' check (generator in ('template', 'agente')),
  add column html_path text,
  add column screenshots jsonb,
  add column published_at timestamptz,
  add column sent_at timestamptz,
  add column attempts int not null default 0,
  add column instruction text,
  alter column expires_at drop not null;

alter table videos
  add column source text not null default 'ia' check (source in ('gravado', 'ia')),
  add column original_path text;
alter table videos drop constraint videos_status_check;
alter table videos add constraint videos_status_check
  check (status in ('na_fila', 'convertendo', 'renderizando', 'pronto', 'erro'));

create table contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  phone_e164 text not null unique,
  whatsapp_lid text,
  lead_id uuid unique references leads (id) on delete set null,
  origin text not null check (origin in ('batch', 'whatsapp_direto', 'manual')),
  batch_id uuid references batches (id) on delete set null,
  status text not null default 'novo' check (status in (
    'novo', 'contatado', 'follow_up', 'em_conversa', 'fechado', 'perdido', 'nao_contatar'
  )),
  status_at timestamptz not null default now(),
  first_contact_at timestamptz,
  responded_at timestamptz,
  follow_up_at timestamptz,
  follow_up_note text,
  follow_ups_without_reply int not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  unread_count int not null default 0,
  comment text
);
create index contacts_status_idx on contacts (status);
create index contacts_last_message_idx on contacts (last_message_at desc);
create trigger contacts_updated_at before update on contacts for each row execute function set_updated_at();

create table messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid not null references contacts (id) on delete cascade,
  direction text not null check (direction in ('entrada', 'saida')),
  sent_from text check (sent_from in ('painel', 'celular')),
  kind text not null default 'texto' check (kind in ('texto', 'imagem', 'audio', 'video', 'documento', 'outro')),
  body text,
  media_path text,
  media_mime text,
  status text not null default 'recebida' check (status in ('recebida', 'pendente', 'enviada', 'entregue', 'lida', 'erro')),
  error text,
  external_id text unique,
  client_message_id text unique,
  is_first_contact boolean not null default false,
  is_follow_up boolean not null default false,
  at timestamptz not null default now()
);
create index messages_contact_at_idx on messages (contact_id, at);

create table whatsapp_connection (
  id int primary key default 1 check (id = 1),
  state text not null default 'desconectado',
  phone text,
  updated_at timestamptz not null default now()
);

alter table clients add column contact_id uuid unique references contacts (id) on delete set null;
alter table services
  add column payment_method text check (payment_method in ('pix', 'boleto', 'cartao')),
  add column first_due_date date,
  add column cycle text;
alter table contracts add column sent_at timestamptz;
alter table charges add column paid_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['lead_assets', 'contacts', 'messages', 'whatsapp_connection'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_authenticated', t);
    execute format('grant all on %I to authenticated, service_role', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values
  ('lead-assets', 'lead-assets', false),
  ('pages', 'pages', false),
  ('videos-originais', 'videos-originais', false),
  ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages, contacts;
  end if;
end $$;

-- Leads da v1 em andamento viram contatos; o lead passa para `crm` (vendido continua vendido).
create or replace function migrate_v1_leads_to_contacts() returns void language plpgsql as $$
begin
  insert into contacts (
    name, phone_e164, lead_id, origin, batch_id, status, first_contact_at, follow_up_at,
    responded_at, follow_ups_without_reply
  )
  select
    l.name, l.phone_e164, l.id, 'batch', l.batch_id,
    case l.stage
      when 'abordar' then 'novo'
      when 'aguardando' then 'contatado'
      when 'follow_up_feito' then 'follow_up'
      when 'conversa' then 'em_conversa'
      when 'vendido' then 'fechado'
    end,
    l.contacted_at, l.follow_up_at, l.responded_at,
    case when l.stage = 'follow_up_feito' then 1 else 0 end
  from leads l
  where l.stage in ('abordar', 'aguardando', 'follow_up_feito', 'conversa', 'vendido')
    and l.phone_e164 is not null
  on conflict (phone_e164) do nothing;

  update leads set stage = 'crm'
  where stage in ('abordar', 'aguardando', 'follow_up_feito', 'conversa')
    and phone_e164 is not null;
end $$;
revoke all on function migrate_v1_leads_to_contacts() from public, anon, authenticated;
grant execute on function migrate_v1_leads_to_contacts() to service_role;

select migrate_v1_leads_to_contacts();
