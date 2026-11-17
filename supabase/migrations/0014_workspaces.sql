-- Workspaces: cada operação (Gabriel e cada primo) tem os próprios batches, leads, conversas, conexão do WhatsApp,
-- contatos, clientes, contratos e cobranças. Um usuário pode ser membro de vários workspaces e alternar entre eles.
--
-- O servidor e o worker usam o service role e filtram por workspace no código (scopeDb, em packages/db).
-- O RLS vale para o navegador (Realtime): cada usuário só recebe linhas dos workspaces de que é membro.
--
-- `do_not_contact` continua global: quem pediu para não receber mensagens não é contatado por nenhum workspace.
--
-- Compatível com o código publicado: quem grava sem workspace cai no workspace padrão (fallback em
-- fill_workspace_id). A 0015 tira esse fallback depois que o código novo estiver no ar.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  slug text not null unique
);

create table workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  role text not null default 'owner' check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on workspace_members (user_id);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    execute 'alter table workspace_members add constraint workspace_members_user_fk foreign key (user_id) references auth.users (id) on delete cascade';
  end if;
end $$;

-- O workspace que recebe tudo o que já existe (a operação do Gabriel).
insert into workspaces (name, slug) values ('Sharken', 'sharken');

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    execute $q$
      insert into workspace_members (workspace_id, user_id, role)
      select w.id, u.id, 'owner' from workspaces w cross join auth.users u where w.slug = 'sharken'
      on conflict do nothing
    $q$;
  end if;
end $$;

create or replace function legacy_default_workspace() returns uuid language sql stable as $$
  select id from workspaces where slug = 'sharken';
$$;

-- Coluna em todas as tabelas da operação, preenchida com o workspace padrão.
do $$
declare t text;
begin
  foreach t in array array[
    'batches', 'leads', 'sites', 'videos', 'lead_assets', 'events', 'contacts', 'messages',
    'clients', 'services', 'contracts', 'charges', 'jobs', 'whatsapp_connection'
  ] loop
    execute format('alter table %I add column workspace_id uuid references workspaces (id) on delete cascade', t);
    execute format('update %I set workspace_id = legacy_default_workspace()', t);
    execute format('create index %I on %I (workspace_id)', t || '_workspace_idx', t);
  end loop;
end $$;

-- Tarefas sem workspace continuam possíveis (tarefas de manutenção); as demais tabelas exigem.
do $$
declare t text;
begin
  foreach t in array array[
    'batches', 'leads', 'sites', 'videos', 'lead_assets', 'events', 'contacts', 'messages',
    'clients', 'services', 'contracts', 'charges', 'whatsapp_connection'
  ] loop
    execute format('alter table %I alter column workspace_id set not null', t);
  end loop;
end $$;

-- Quem grava sem workspace herda o do registro pai (lead do batch, mensagem do contato, cobrança do serviço...).
-- Cobre as funções do banco (close_deal, crm_insert_message), que inserem sem dizer o workspace.
create or replace function fill_workspace_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is not null then return new; end if;
  if tg_table_name = 'leads' then
    new.workspace_id := (select workspace_id from batches where id = new.batch_id);
  elsif tg_table_name in ('sites', 'videos', 'lead_assets', 'events') then
    new.workspace_id := (select workspace_id from leads where id = new.lead_id);
  elsif tg_table_name = 'contacts' then
    new.workspace_id := coalesce(
      (select workspace_id from leads where id = new.lead_id),
      (select workspace_id from batches where id = new.batch_id));
  elsif tg_table_name = 'messages' then
    new.workspace_id := (select workspace_id from contacts where id = new.contact_id);
  elsif tg_table_name = 'clients' then
    new.workspace_id := coalesce(
      (select workspace_id from contacts where id = new.contact_id),
      (select workspace_id from leads where id = new.lead_id));
  elsif tg_table_name = 'services' then
    new.workspace_id := (select workspace_id from clients where id = new.client_id);
  elsif tg_table_name in ('contracts', 'charges') then
    new.workspace_id := (select workspace_id from services where id = new.service_id);
  end if;
  -- Só durante a troca de código (removido na 0015).
  if new.workspace_id is null and tg_table_name <> 'jobs' then
    new.workspace_id := legacy_default_workspace();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'batches', 'leads', 'sites', 'videos', 'lead_assets', 'events', 'contacts', 'messages',
    'clients', 'services', 'contracts', 'charges', 'jobs', 'whatsapp_connection'
  ] loop
    execute format('create trigger %I before insert on %I for each row execute function fill_workspace_id()', t || '_fill_workspace', t);
  end loop;
end $$;

-- Únicos por workspace: dois primos podem prospectar o mesmo negócio, e uma mensagem trocada entre dois números
-- conectados chega com o mesmo id do WhatsApp nos dois workspaces.
alter table leads drop constraint leads_place_id_key;
create unique index leads_workspace_place_key on leads (workspace_id, place_id);
alter table contacts drop constraint contacts_phone_e164_key;
create unique index contacts_workspace_phone_key on contacts (workspace_id, phone_e164);
alter table messages drop constraint messages_external_id_key;
create unique index messages_workspace_external_key on messages (workspace_id, external_id);

-- Uma conexão do WhatsApp por workspace. A linha antiga (id = 1) fica com o workspace padrão.
alter table whatsapp_connection drop constraint whatsapp_connection_id_check;
create sequence whatsapp_connection_id_seq start with 2 owned by whatsapp_connection.id;
alter table whatsapp_connection alter column id set default nextval('whatsapp_connection_id_seq');
create unique index whatsapp_connection_workspace_key on whatsapp_connection (workspace_id);
create unique index whatsapp_connection_instance_key on whatsapp_connection (instance) where instance is not null;

-- RLS: membro do workspace. security definer para não depender do RLS de workspace_members.
create or replace function is_workspace_member(ws uuid) returns boolean language plpgsql stable security definer
set search_path = public as $$
begin
  return exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
end $$;
revoke all on function is_workspace_member(uuid) from public, anon;
grant execute on function is_workspace_member(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'batches', 'leads', 'sites', 'videos', 'lead_assets', 'events', 'contacts', 'messages',
    'clients', 'services', 'contracts', 'charges', 'jobs', 'whatsapp_connection'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_authenticated', t);
    execute format('create policy %I on %I for all to authenticated using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))', t || '_member', t);
  end loop;
end $$;

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
create policy workspaces_member on workspaces for select to authenticated using (is_workspace_member(id));
create policy workspace_members_member on workspace_members for select to authenticated using (is_workspace_member(workspace_id));
grant select on workspaces, workspace_members to authenticated;
grant all on workspaces, workspace_members to service_role;

-- Contagens do CRM por workspace (as versões sem argumento ficam para o código publicado; saem na 0015).
create or replace function crm_hoje_ids(p_workspace uuid) returns setof uuid language sql stable as $$
  select c.id from contacts c
  where (p_workspace is null or c.workspace_id = p_workspace)
    and c.status not in ('nao_contatar', 'perdido')
    and (
      (c.last_inbound_at is not null and (c.last_outbound_at is null or c.last_inbound_at > c.last_outbound_at))
      or (c.follow_up_at is not null and c.follow_up_at <= now())
      or exists (
        select 1 from clients cl
        join services s on s.client_id = cl.id
        join charges ch on ch.service_id = s.id
        where cl.contact_id = c.id and ch.status = 'vencido'
      )
    );
$$;

create or replace function crm_box_counts(p_workspace uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'hoje', (select count(*) from crm_hoje_ids(p_workspace)),
    'novos', count(*) filter (where status = 'novo'),
    'aguardando', count(*) filter (where status in ('contatado', 'follow_up')),
    'em_conversa', count(*) filter (where status = 'em_conversa'),
    'fechados', count(*) filter (where status = 'fechado'),
    'perdidos', count(*) filter (where status in ('perdido', 'nao_contatar')),
    'todos', count(*)
  ) from contacts where p_workspace is null or workspace_id = p_workspace;
$$;

create or replace function crm_chat_counts(p_workspace uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'aberto', count(*) filter (where chat_state = 'aberto'),
    'pendente', count(*) filter (where chat_state = 'pendente'),
    'fechado', count(*) filter (where chat_state = 'fechado'),
    'pendente_nao_lidas', coalesce(sum(unread_count) filter (where chat_state = 'pendente'), 0)
  ) from contacts where p_workspace is null or workspace_id = p_workspace;
$$;

revoke all on function crm_hoje_ids(uuid), crm_box_counts(uuid), crm_chat_counts(uuid) from public, anon;
grant execute on function crm_hoje_ids(uuid), crm_box_counts(uuid), crm_chat_counts(uuid) to authenticated, service_role;

-- Fechar negócio confere que o contato é do workspace informado (input.workspace_id).
create or replace function close_deal(input jsonb) returns uuid language plpgsql as $$
declare
  v_contact contacts;
  v_lead leads;
  v_client_id uuid;
  v_service_id uuid;
  v_contract_id uuid;
  c jsonb := input->'client';
  s jsonb := input->'service';
  p jsonb := input->'payment';
begin
  if nullif(input->>'request_id', '') is not null then
    -- Dois envios simultâneos com a mesma chave esperam um pelo outro; o segundo acha o contrato do primeiro.
    perform pg_advisory_xact_lock(hashtext(input->>'request_id'));
    select id into v_contract_id from contracts where request_id = input->>'request_id';
    if v_contract_id is not null then return v_contract_id; end if;
  end if;

  select * into v_contact from contacts where id = (input->>'contact_id')::uuid for update;
  if v_contact.id is null then raise exception 'Contato não encontrado.'; end if;
  if nullif(input->>'workspace_id', '') is not null and v_contact.workspace_id <> (input->>'workspace_id')::uuid then
    raise exception 'Contato não encontrado.';
  end if;
  if v_contact.status = 'nao_contatar' then raise exception 'Contato marcado como Não contatar: não dá para fechar negócio.'; end if;

  if v_contact.lead_id is not null then
    select * into v_lead from leads where id = v_contact.lead_id for update;
  end if;

  -- Cliente: o do contato; senão o que já nasceu do lead; senão um novo.
  select id into v_client_id from clients where contact_id = v_contact.id;
  if v_client_id is null and v_contact.lead_id is not null then
    select id into v_client_id from clients where lead_id = v_contact.lead_id;
  end if;

  if v_client_id is null then
    insert into clients (workspace_id, contact_id, lead_id, legal_name, document, contact_name, email, phone, address, location)
    values (
      v_contact.workspace_id, v_contact.id, v_contact.lead_id, trim(c->>'legal_name'), upper(regexp_replace(c->>'document', '[^0-9A-Za-z]', '', 'g')),
      nullif(trim(c->>'contact_name'), ''), nullif(trim(c->>'email'), ''), nullif(trim(c->>'phone'), ''),
      nullif(trim(c->>'address'), ''), nullif(trim(c->>'location'), '')
    ) returning id into v_client_id;
  else
    update clients set
      contact_id = v_contact.id,
      lead_id = coalesce(lead_id, v_contact.lead_id),
      legal_name = trim(c->>'legal_name'),
      document = upper(regexp_replace(c->>'document', '[^0-9A-Za-z]', '', 'g')),
      contact_name = nullif(trim(c->>'contact_name'), ''),
      email = nullif(trim(c->>'email'), ''),
      phone = nullif(trim(c->>'phone'), ''),
      address = nullif(trim(c->>'address'), ''),
      location = coalesce(nullif(trim(c->>'location'), ''), location)
    where id = v_client_id;
  end if;

  insert into services (workspace_id, client_id, name, kind, amount_cents, start_date, notes, payment_method, first_due_date, cycle)
  values (
    v_contact.workspace_id, v_client_id, trim(s->>'name'), s->>'kind', (s->>'amount_cents')::int, (s->>'start_date')::date,
    nullif(trim(s->>'notes'), ''), p->>'method', (p->>'first_due_date')::date,
    case when s->>'kind' = 'recorrente' then nullif(p->>'cycle', '') end
  ) returning id into v_service_id;

  insert into contracts (workspace_id, service_id, request_id)
  values (v_contact.workspace_id, v_service_id, nullif(input->>'request_id', '')) returning id into v_contract_id;

  update contacts set status = 'fechado', status_at = now(), follow_up_at = null where id = v_contact.id;

  if v_lead.id is not null then
    insert into events (workspace_id, lead_id, type, data) values
      (v_contact.workspace_id, v_lead.id, 'contato_fechado', jsonb_build_object('contact_id', v_contact.id, 'client_id', v_client_id)),
      (v_contact.workspace_id, v_lead.id, 'contrato_criado', jsonb_build_object('contact_id', v_contact.id, 'contract_id', v_contract_id, 'service_id', v_service_id));
    -- Só o lead que está no CRM vira vendido (crm -> vendido, como canTransition).
    if v_lead.stage = 'crm' then
      update leads set stage = 'vendido', sold_at = now() where id = v_lead.id;
      insert into events (workspace_id, lead_id, type, data) values (v_contact.workspace_id, v_lead.id, 'etapa_vendido', jsonb_build_object('contact_id', v_contact.id));
    end if;
  end if;

  return v_contract_id;
end $$;

revoke all on function close_deal(jsonb) from public, anon;
grant execute on function close_deal(jsonb) to authenticated, service_role;
