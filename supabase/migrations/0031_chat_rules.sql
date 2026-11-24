-- Regras do chat e preparo dos logs (spec 2026-11-24-chat-atendimento-logs). Aplicar ANTES de publicar o código.
-- changed_by: quem faz esta mudança. O gatilho da 0032 lê e zera, então mudança sem autor é automática.
alter table contacts add column changed_by uuid;

alter table messages drop constraint messages_direction_check;
alter table messages add constraint messages_direction_check check (direction in ('entrada', 'saida', 'nota', 'log'));

-- Quem abre vira o responsável.
create or replace function crm_open_chat(p_contact uuid, p_workspace uuid, p_user uuid, p_from text default null)
returns setof uuid language sql as $$
  update contacts c set
    chat_state = 'aberto',
    chat_state_at = now(),
    responsible_id = p_user,
    responsible_by = p_user,
    changed_by = p_user
  where c.id = p_contact and c.workspace_id = p_workspace and c.chat_state <> 'aberto' and (p_from is null or c.chat_state = p_from)
  returning c.id;
$$;

drop function crm_touch_contact(uuid, timestamptz, text, text);
create function crm_touch_contact(p_contact uuid, p_at timestamptz, p_preview text, p_direction text, p_change_state boolean default true)
returns void language sql as $$
  update contacts set
    last_message_preview = case when last_message_at is null or last_message_at <= p_at then p_preview else last_message_preview end,
    last_message_at = case when last_message_at is null or last_message_at <= p_at then p_at else last_message_at end,
    last_inbound_at = case when p_direction = 'entrada' then greatest(last_inbound_at, p_at) else last_inbound_at end,
    unread_count = case when p_direction = 'entrada' then unread_count + 1 else unread_count end,
    last_outbound_at = case when p_direction = 'saida' then greatest(last_outbound_at, p_at) else last_outbound_at end,
    chat_state = case
      when p_change_state and p_direction = 'entrada' and chat_state = 'fechado' then 'pendente'
      when p_change_state and p_direction = 'saida' and chat_state = 'fechado' then 'aberto'
      else chat_state end,
    chat_state_at = case when p_change_state and chat_state = 'fechado' then now() else chat_state_at end
  where id = p_contact;
$$;
revoke all on function crm_touch_contact(uuid, timestamptz, text, text, boolean) from public, anon;
grant execute on function crm_touch_contact(uuid, timestamptz, text, text, boolean) to authenticated, service_role;

-- Igual à 0029, menos a reabertura pelo envio do painel.
create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare
  m messages;
  conn_phone text;
  conn_name text;
begin
  -- Histórico importado pode ter saído por outro número: fica sem conexão.
  if p->>'direction' = 'saida' and not coalesce((p->>'history')::boolean, false) then
    select w.phone, w.profile_name into conn_phone, conn_name
    from contacts c join whatsapp_connection w on w.workspace_id = c.workspace_id
    where c.id = (p->>'contact_id')::uuid;
  end if;
  insert into messages (
    contact_id, direction, sent_from, kind, body, media_path, media_mime, status, error,
    external_id, client_message_id, is_first_contact, is_follow_up, at, quoted_external_id, quoted_preview, meta,
    sent_by, sent_by_email, connection_phone, connection_name
  ) values (
    (p->>'contact_id')::uuid, p->>'direction', p->>'sent_from', coalesce(p->>'kind', 'texto'), p->>'body',
    p->>'media_path', p->>'media_mime', coalesce(p->>'status', 'recebida'), p->>'error',
    p->>'external_id', p->>'client_message_id',
    coalesce((p->>'is_first_contact')::boolean, false), coalesce((p->>'is_follow_up')::boolean, false),
    coalesce((p->>'at')::timestamptz, now()), p->>'quoted_external_id', p->>'quoted_preview',
    coalesce(p->'meta', '{}'::jsonb),
    (p->>'sent_by')::uuid, p->>'sent_by_email', conn_phone, conn_name
  ) on conflict do nothing returning * into m;
  if m.id is null then return; end if;
  -- Enviar pelo painel não muda o estado (intervenção pontual). O histórico importado também não.
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction,
    not coalesce((p->>'history')::boolean, false) and m.sent_from is distinct from 'painel');
  return next m;
end $$;

-- Igual à 0014, mais o autor da mudança.
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

  update contacts set status = 'fechado', status_at = now(), follow_up_at = null, changed_by = nullif(input->>'changed_by', '')::uuid where id = v_contact.id;

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
