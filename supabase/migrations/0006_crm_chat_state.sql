-- CRM: estado do atendimento (aberto, pendente, fechado), foto do contato e dados da conexão do WhatsApp.
--
-- Regras do estado do atendimento, independentes do status comercial:
--   fechado  + mensagem recebida      -> pendente
--   pendente + Gabriel abre a conversa -> aberto   (ação no painel)
--   qualquer + Gabriel fecha          -> fechado  (ação no painel)
--   fechado  + Gabriel envia mensagem -> aberto

alter table contacts
  add column chat_state text not null default 'aberto' check (chat_state in ('aberto', 'pendente', 'fechado')),
  add column chat_state_at timestamptz not null default now(),
  add column avatar_url text,
  add column avatar_checked_at timestamptz;

-- Quem já terminou (fechado, perdido, não contatar) começa fechado; quem tem mensagem sem resposta, pendente.
update contacts set chat_state = case
  when status in ('fechado', 'perdido', 'nao_contatar') then 'fechado'
  when last_inbound_at is not null and (last_outbound_at is null or last_inbound_at > last_outbound_at) then 'pendente'
  else 'aberto'
end;

create index contacts_chat_state_idx on contacts (chat_state, last_message_at desc nulls last);

create or replace function crm_touch_contact(p_contact uuid, p_at timestamptz, p_preview text, p_direction text)
returns void language sql as $$
  update contacts set
    last_message_preview = case when last_message_at is null or last_message_at <= p_at then p_preview else last_message_preview end,
    last_message_at = case when last_message_at is null or last_message_at <= p_at then p_at else last_message_at end,
    last_inbound_at = case when p_direction = 'entrada' then greatest(last_inbound_at, p_at) else last_inbound_at end,
    unread_count = case when p_direction = 'entrada' then unread_count + 1 else unread_count end,
    last_outbound_at = case when p_direction = 'saida' then greatest(last_outbound_at, p_at) else last_outbound_at end,
    chat_state = case
      when p_direction = 'entrada' and chat_state = 'fechado' then 'pendente'
      when p_direction = 'saida' and chat_state = 'fechado' then 'aberto'
      else chat_state end,
    chat_state_at = case
      when chat_state = 'fechado' then now()
      else chat_state_at end
  where id = p_contact;
$$;

create or replace function crm_chat_counts() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'aberto', count(*) filter (where chat_state = 'aberto'),
    'pendente', count(*) filter (where chat_state = 'pendente'),
    'fechado', count(*) filter (where chat_state = 'fechado'),
    'pendente_nao_lidas', coalesce(sum(unread_count) filter (where chat_state = 'pendente'), 0)
  ) from contacts;
$$;

revoke all on function crm_chat_counts() from public, anon;
grant execute on function crm_chat_counts() to authenticated, service_role;

alter table whatsapp_connection
  add column profile_name text,
  add column profile_pic_url text,
  add column instance text,
  add column status_reason int;

-- A tela de conexões acompanha o estado em tempo real.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_connection') then
    alter publication supabase_realtime add table whatsapp_connection;
  end if;
end $$;
