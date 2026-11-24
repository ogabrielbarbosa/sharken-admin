-- Liga os logs do chat. Aplicar DEPOIS de publicar o código que entende direction = 'log'.
create or replace function contacts_log_changes() returns trigger language plpgsql security definer set search_path = public as $$
declare
  change record;
begin
  for change in
    select * from (values
      (1, 'estado', old.chat_state, new.chat_state),
      (2, 'responsavel', old.responsible_id::text, new.responsible_id::text),
      (3, 'status', old.status, new.status)
    ) v (pos, field, from_value, to_value)
    where v.from_value is distinct from v.to_value
    order by pos
  loop
    insert into messages (workspace_id, contact_id, direction, kind, status, sent_by, at, meta)
    values (new.workspace_id, new.id, 'log', 'texto', 'recebida', new.changed_by,
      clock_timestamp() + change.pos * interval '1 microsecond',
      jsonb_build_object('log', jsonb_build_object('field', change.field, 'from', change.from_value, 'to', change.to_value)));
  end loop;
  new.changed_by := null;
  return new;
end $$;
revoke all on function contacts_log_changes() from public, anon, authenticated;
-- "zz": depois de contacts_responsible, que pode trocar o responsável.
create trigger contacts_zz_log before update on contacts for each row execute function contacts_log_changes();
