-- O código publicado já grava sempre com workspace: sai o fallback da 0014 (gravar sem workspace agora falha,
-- em vez de cair em silêncio na operação do Gabriel) e as versões sem workspace das contagens do CRM.
create or replace function fill_workspace_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is not null then return new; end if;
  if tg_table_name = 'leads' then
    new.workspace_id := (select workspace_id from batches where id = new.batch_id);
  elsif tg_table_name in ('sites', 'videos', 'lead_assets', 'events') then
    new.workspace_id := (select workspace_id from leads where id = new.lead_id);
  elsif tg_table_name = 'contacts' then
    new.workspace_id := coalesce(
      (select workspace_id from leads where id = new.lead_id),
      (select workspace_id from batches where id = new.batch_id));
  elsif tg_table_name = 'messages' then
    new.workspace_id := (select workspace_id from contacts where id = new.contact_id);
  elsif tg_table_name = 'clients' then
    new.workspace_id := coalesce(
      (select workspace_id from contacts where id = new.contact_id),
      (select workspace_id from leads where id = new.lead_id));
  elsif tg_table_name = 'services' then
    new.workspace_id := (select workspace_id from clients where id = new.client_id);
  elsif tg_table_name in ('contracts', 'charges') then
    new.workspace_id := (select workspace_id from services where id = new.service_id);
  end if;
  return new;
end $$;

drop function if exists crm_box_counts();
drop function if exists crm_chat_counts();
drop function if exists crm_hoje_ids();
