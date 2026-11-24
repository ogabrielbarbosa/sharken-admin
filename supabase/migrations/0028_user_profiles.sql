-- Nome e foto de cada usuário (um perfil só, para todos os workspaces) e a conexão de cada mensagem enviada.
-- Sem chave estrangeira: o histórico do chat continua com nome e foto se a conta sair.
create table user_profiles (
  user_id uuid primary key,
  updated_at timestamptz not null default now(),
  name text,
  avatar_path text
);
-- Só o servidor (service_role) lê e grava.
alter table user_profiles enable row level security;
grant all on user_profiles to service_role;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;

-- Cópia do momento do envio: trocar o número não muda o histórico. Mensagens antigas ficam nulas.
alter table messages
  add column connection_phone text,
  add column connection_name text;

create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare
  m messages;
  conn_phone text;
  conn_name text;
begin
  if p->>'direction' = 'saida' then
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
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;
