-- Reply: a mensagem guarda qual mensagem ela cita (id do WhatsApp) e um trecho dela, para mostrar a citação
-- mesmo quando a original não está no CRM (histórico não importado, mensagem antiga fora da página).
alter table messages
  add column quoted_external_id text,
  add column quoted_preview text;

create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare m messages;
begin
  insert into messages (
    contact_id, direction, sent_from, kind, body, media_path, media_mime, status, error,
    external_id, client_message_id, is_first_contact, is_follow_up, at, quoted_external_id, quoted_preview
  ) values (
    (p->>'contact_id')::uuid, p->>'direction', p->>'sent_from', coalesce(p->>'kind', 'texto'), p->>'body',
    p->>'media_path', p->>'media_mime', coalesce(p->>'status', 'recebida'), p->>'error',
    p->>'external_id', p->>'client_message_id',
    coalesce((p->>'is_first_contact')::boolean, false), coalesce((p->>'is_follow_up')::boolean, false),
    coalesce((p->>'at')::timestamptz, now()), p->>'quoted_external_id', p->>'quoted_preview'
  ) on conflict do nothing returning * into m;
  if m.id is null then return; end if;
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;
