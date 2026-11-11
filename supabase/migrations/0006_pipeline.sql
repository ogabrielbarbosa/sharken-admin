-- Pipeline do batch: Revisar → Completar → Página → Vídeo → CRM. Página e vídeo viram links colados pelo Gabriel.

alter table leads
  add column page_url text,
  add column loom_url text,
  add column stage_changed_at timestamptz not null default now();

update leads set stage_changed_at = updated_at;

alter table leads drop constraint leads_stage_check;

-- A 0002 já converteu as etapas da v1 (abordar, aguardando, follow_up_feito, conversa).
-- Se algum lead voltou a elas depois, vai para o CRM antes de o check ser recriado.
update leads set stage = 'pagina' where stage in ('gerando_material', 'revisar_material');
update leads set stage = 'crm' where stage in ('abordar', 'aguardando', 'follow_up_feito', 'conversa');

alter table leads add constraint leads_stage_check check (stage in (
  'analisando', 'revisar', 'completar', 'pagina', 'video', 'vendido', 'crm',
  'descartado', 'sem_interesse', 'nao_contatar'
));

create or replace function set_stage_changed_at() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
  end if;
  return new;
end $$;

create trigger leads_stage_changed_at before update on leads
  for each row execute function set_stage_changed_at();

-- Não há estado de cancelamento em jobs.status: a tarefa fica em erro, com o motivo.
update jobs set status = 'erro', error = 'Cancelado: geração automática removida'
where status = 'pendente' and type in ('build_page', 'generate_page', 'render_video', 'transcode_video');
