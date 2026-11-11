alter table contracts add column request_id text unique;

-- Fechar negócio com chave de idempotência (request_id) e documento só com números/letras.
-- Fechar negócio: cliente, serviço com o combinado, contrato em rascunho, contato fechado e lead vendido numa transação.
-- Uma função plpgsql roda inteira numa transação, então qualquer erro desfaz tudo.
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
    insert into clients (contact_id, lead_id, legal_name, document, contact_name, email, phone, address, location)
    values (
      v_contact.id, v_contact.lead_id, trim(c->>'legal_name'), upper(regexp_replace(c->>'document', '[^0-9A-Za-z]', '', 'g')),
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

  insert into services (client_id, name, kind, amount_cents, start_date, notes, payment_method, first_due_date, cycle)
  values (
    v_client_id, trim(s->>'name'), s->>'kind', (s->>'amount_cents')::int, (s->>'start_date')::date,
    nullif(trim(s->>'notes'), ''), p->>'method', (p->>'first_due_date')::date,
    case when s->>'kind' = 'recorrente' then nullif(p->>'cycle', '') end
  ) returning id into v_service_id;

  insert into contracts (service_id, request_id) values (v_service_id, nullif(input->>'request_id', '')) returning id into v_contract_id;

  update contacts set status = 'fechado', status_at = now(), follow_up_at = null where id = v_contact.id;

  if v_lead.id is not null then
    insert into events (lead_id, type, data) values
      (v_lead.id, 'contato_fechado', jsonb_build_object('contact_id', v_contact.id, 'client_id', v_client_id)),
      (v_lead.id, 'contrato_criado', jsonb_build_object('contact_id', v_contact.id, 'contract_id', v_contract_id, 'service_id', v_service_id));
    -- Só o lead que está no CRM vira vendido (crm -> vendido, como canTransition).
    if v_lead.stage = 'crm' then
      update leads set stage = 'vendido', sold_at = now() where id = v_lead.id;
      insert into events (lead_id, type, data) values (v_lead.id, 'etapa_vendido', jsonb_build_object('contact_id', v_contact.id));
    end if;
  end if;

  return v_contract_id;
end $$;

revoke all on function close_deal(jsonb) from public, anon;
grant execute on function close_deal(jsonb) to authenticated, service_role;
