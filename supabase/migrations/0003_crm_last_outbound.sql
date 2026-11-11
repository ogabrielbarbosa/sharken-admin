-- CRM: último envio do contato e consultas das caixas.
alter table contacts add column last_outbound_at timestamptz;

update contacts c set last_outbound_at = m.last_at
from (select contact_id, max(at) as last_at from messages where direction = 'saida' group by contact_id) m
where m.contact_id = c.id;

-- Contadores sempre avançam; prévia e horário da última mensagem só quando a mensagem não é mais antiga.
create or replace function crm_touch_contact(p_contact uuid, p_at timestamptz, p_preview text, p_direction text)
returns void language sql as $$
  update contacts set
    last_message_preview = case when last_message_at is null or last_message_at <= p_at then p_preview else last_message_preview end,
    last_message_at = case when last_message_at is null or last_message_at <= p_at then p_at else last_message_at end,
    last_inbound_at = case when p_direction = 'entrada' then greatest(last_inbound_at, p_at) else last_inbound_at end,
    unread_count = case when p_direction = 'entrada' then unread_count + 1 else unread_count end,
    last_outbound_at = case when p_direction = 'saida' then greatest(last_outbound_at, p_at) else last_outbound_at end
  where id = p_contact;
$$;

-- Grava a mensagem e atualiza o contato na mesma transação. Sem linha de volta se já existia.
create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare m messages;
begin
  insert into messages (
    contact_id, direction, sent_from, kind, body, media_path, media_mime, status, error,
    external_id, client_message_id, is_first_contact, is_follow_up, at
  ) values (
    (p->>'contact_id')::uuid, p->>'direction', p->>'sent_from', coalesce(p->>'kind', 'texto'), p->>'body',
    p->>'media_path', p->>'media_mime', coalesce(p->>'status', 'recebida'), p->>'error',
    p->>'external_id', p->>'client_message_id',
    coalesce((p->>'is_first_contact')::boolean, false), coalesce((p->>'is_follow_up')::boolean, false),
    coalesce((p->>'at')::timestamptz, now())
  ) on conflict do nothing returning * into m;
  if m.id is null then return; end if;
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;

-- Caixa Hoje: recebida sem resposta, follow-up vencido ou cobrança vencida do cliente.
create or replace function crm_hoje_ids() returns setof uuid language sql stable as $$
  select c.id from contacts c
  where c.status not in ('nao_contatar', 'perdido')
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

create or replace function crm_box_counts() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'hoje', (select count(*) from crm_hoje_ids()),
    'novos', count(*) filter (where status = 'novo'),
    'aguardando', count(*) filter (where status in ('contatado', 'follow_up')),
    'em_conversa', count(*) filter (where status = 'em_conversa'),
    'fechados', count(*) filter (where status = 'fechado'),
    'perdidos', count(*) filter (where status in ('perdido', 'nao_contatar')),
    'todos', count(*)
  ) from contacts;
$$;

revoke all on function crm_touch_contact(uuid, timestamptz, text, text), crm_insert_message(jsonb), crm_hoje_ids(), crm_box_counts() from public, anon;
grant execute on function crm_touch_contact(uuid, timestamptz, text, text), crm_insert_message(jsonb), crm_hoje_ids(), crm_box_counts() to authenticated, service_role;
