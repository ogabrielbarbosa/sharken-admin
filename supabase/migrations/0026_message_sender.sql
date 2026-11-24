-- Quem enviou cada mensagem pelo painel (e quem escreveu cada nota interna).
-- O e-mail é uma cópia do momento do envio e não há chave estrangeira: o registro continua
-- valendo se o membro sair do workspace ou a conta for apagada. Mensagens antigas ficam nulas.
alter table messages
  add column sent_by uuid,
  add column sent_by_email text;

create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare m messages;
begin
  insert into messages (
    contact_id, direction, sent_from, kind, body, media_path, media_mime, status, error,
    external_id, client_message_id, is_first_contact, is_follow_up, at, quoted_external_id, quoted_preview, meta,
    sent_by, sent_by_email
  ) values (
    (p->>'contact_id')::uuid, p->>'direction', p->>'sent_from', coalesce(p->>'kind', 'texto'), p->>'body',
    p->>'media_path', p->>'media_mime', coalesce(p->>'status', 'recebida'), p->>'error',
    p->>'external_id', p->>'client_message_id',
    coalesce((p->>'is_first_contact')::boolean, false), coalesce((p->>'is_follow_up')::boolean, false),
    coalesce((p->>'at')::timestamptz, now()), p->>'quoted_external_id', p->>'quoted_preview',
    coalesce(p->'meta', '{}'::jsonb),
    (p->>'sent_by')::uuid, p->>'sent_by_email'
  ) on conflict do nothing returning * into m;
  if m.id is null then return; end if;
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;
