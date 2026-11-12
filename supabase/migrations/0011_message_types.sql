-- Todos os tipos de mensagem do WhatsApp (spec do CRM, "Tipos de mensagem").
--   kind: entram figurinha, localização, contato e enquete.
--   meta: o que cada tipo precisa para aparecer certo (duração e forma de onda do áudio, nome e tamanho do
--         documento, coordenadas, vCards, opções da enquete, botões, visualização única, encaminhada...).
--   reactions: reações à mensagem, uma por lado (eu / contato), como no WhatsApp.
--   edited_at / deleted_at: a mensagem foi editada ou apagada para todos. O texto original fica guardado em
--         meta.original_body (editada) ou continua no body (apagada), só para o painel.
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (kind in ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'localizacao', 'contato', 'enquete', 'outro'));

alter table messages
  add column meta jsonb not null default '{}'::jsonb,
  add column reactions jsonb not null default '[]'::jsonb,
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

-- Figurinhas recebidas antes desta migração entraram como "outro" (image/webp).
update messages set kind = 'sticker' where kind = 'outro' and media_mime like 'image/webp%';

create or replace function crm_insert_message(p jsonb) returns setof messages language plpgsql as $$
declare m messages;
begin
  insert into messages (
    contact_id, direction, sent_from, kind, body, media_path, media_mime, status, error,
    external_id, client_message_id, is_first_contact, is_follow_up, at, quoted_external_id, quoted_preview, meta
  ) values (
    (p->>'contact_id')::uuid, p->>'direction', p->>'sent_from', coalesce(p->>'kind', 'texto'), p->>'body',
    p->>'media_path', p->>'media_mime', coalesce(p->>'status', 'recebida'), p->>'error',
    p->>'external_id', p->>'client_message_id',
    coalesce((p->>'is_first_contact')::boolean, false), coalesce((p->>'is_follow_up')::boolean, false),
    coalesce((p->>'at')::timestamptz, now()), p->>'quoted_external_id', p->>'quoted_preview',
    coalesce(p->'meta', '{}'::jsonb)
  ) on conflict do nothing returning * into m;
  if m.id is null then return; end if;
  perform crm_touch_contact(m.contact_id, m.at, p->>'preview', m.direction);
  return next m;
end $$;
