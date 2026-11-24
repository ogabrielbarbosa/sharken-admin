-- Responsável do lead e do atendimento (independentes), com histórico de cada troca.
-- Atendimento aberto sempre tem responsável: o banco garante, porque nem toda abertura vem de um clique
-- (mensagem enviada pelo celular, webhook, scripts). Compatível com o código anterior.
alter table leads add column responsible_id uuid, add column responsible_by uuid;
alter table contacts add column responsible_id uuid, add column responsible_by uuid;
-- responsible_by: quem fez a última troca (nulo = automático).

create or replace function workspace_owner(ws uuid) returns uuid language sql stable security definer set search_path = public as $$
  select user_id from workspace_members where workspace_id = ws
  order by (role = 'owner') desc, created_at, user_id limit 1;
$$;
revoke all on function workspace_owner(uuid) from public, anon, authenticated;
grant execute on function workspace_owner(uuid) to service_role;

-- Abertos de hoje: quem enviou a última mensagem pelo painel; sem isso, o dono.
update contacts c set responsible_id = coalesce(
  (select m.sent_by from messages m
   join workspace_members w on w.workspace_id = c.workspace_id and w.user_id = m.sent_by
   where m.contact_id = c.id and m.direction = 'saida' order by m.at desc limit 1),
  workspace_owner(c.workspace_id))
where c.chat_state = 'aberto';

create table responsible_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  contact_id uuid references contacts (id) on delete cascade,
  from_id uuid,
  to_id uuid,
  by_id uuid,
  check (num_nonnulls(lead_id, contact_id) = 1)
);
create index responsible_events_contact_idx on responsible_events (contact_id, created_at desc);
create index responsible_events_lead_idx on responsible_events (lead_id, created_at desc);
create index responsible_events_workspace_idx on responsible_events (workspace_id);
alter table responsible_events enable row level security;
grant all on responsible_events to service_role;

-- Nome depois de contacts_fill_workspace: os gatilhos rodam em ordem alfabética.
create or replace function contacts_keep_responsible() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Só membro pode ser responsável (o administrador da plataforma pode abrir sem ser membro).
  if new.responsible_id is not null
     and (tg_op = 'INSERT' or new.responsible_id is distinct from old.responsible_id)
     and not exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = new.responsible_id) then
    new.responsible_id := null;
  end if;
  if new.chat_state = 'aberto' and new.responsible_id is null then
    new.responsible_id := coalesce(
      (select l.responsible_id from leads l join workspace_members w on w.workspace_id = new.workspace_id and w.user_id = l.responsible_id
       where l.id = new.lead_id and l.workspace_id = new.workspace_id),
      workspace_owner(new.workspace_id));
    if tg_op = 'UPDATE' and new.responsible_by is not distinct from old.responsible_by then new.responsible_by := null; end if;
  end if;
  return new;
end $$;
create trigger contacts_responsible before insert or update on contacts for each row execute function contacts_keep_responsible();

create or replace function log_responsible() returns trigger language plpgsql security definer set search_path = public as $$
declare previous uuid;
begin
  if tg_op = 'UPDATE' then previous := old.responsible_id; end if;
  if new.responsible_id is not distinct from previous then return null; end if;
  if tg_table_name = 'leads' then
    insert into responsible_events (workspace_id, lead_id, from_id, to_id, by_id) values (new.workspace_id, new.id, previous, new.responsible_id, new.responsible_by);
  else
    insert into responsible_events (workspace_id, contact_id, from_id, to_id, by_id) values (new.workspace_id, new.id, previous, new.responsible_id, new.responsible_by);
  end if;
  return null;
end $$;
create trigger leads_responsible_log after insert or update on leads for each row execute function log_responsible();
create trigger contacts_responsible_log after insert or update on contacts for each row execute function log_responsible();

-- Membro removido: os leads ficam sem responsável e os atendimentos abertos passam ao lead ou ao dono.
create or replace function release_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspaces where id = old.workspace_id) then return null; end if;
  update leads set responsible_id = null, responsible_by = null where workspace_id = old.workspace_id and responsible_id = old.user_id;
  update contacts set responsible_id = null, responsible_by = null where workspace_id = old.workspace_id and responsible_id = old.user_id;
  return null;
end $$;
create trigger workspace_members_release after delete on workspace_members for each row execute function release_member();

revoke all on function contacts_keep_responsible(), log_responsible(), release_member() from public, anon, authenticated;

-- Abrir por um clique: na primeira vez vale o responsável do lead; senão, quem abriu. `p_from` evita corrida.
create or replace function crm_open_chat(p_contact uuid, p_workspace uuid, p_user uuid, p_from text default null)
returns setof uuid language sql as $$
  update contacts c set
    chat_state = 'aberto',
    chat_state_at = now(),
    responsible_id = case when c.responsible_id is null
      then coalesce((select l.responsible_id from leads l where l.id = c.lead_id and l.workspace_id = c.workspace_id), p_user)
      else p_user end,
    responsible_by = p_user
  where c.id = p_contact and c.workspace_id = p_workspace and c.chat_state <> 'aberto' and (p_from is null or c.chat_state = p_from)
  returning c.id;
$$;
revoke all on function crm_open_chat(uuid, uuid, uuid, text) from public, anon;
grant execute on function crm_open_chat(uuid, uuid, uuid, text) to authenticated, service_role;

-- Igual à 0028, mais: enviar pelo painel num atendimento fechado o abre com quem enviou.
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
  if m.direction = 'saida' and m.sent_by is not null then
    perform crm_open_chat(m.contact_id, m.workspace_id, m.sent_by, 'fechado');
  end if;
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;
