-- Batch a partir de um perfil do Instagram: os seguidores e/ou quem ele segue viram leads.
-- Só acrescenta: o código publicado continua funcionando.
alter table batches drop constraint batches_source_check;
alter table batches add constraint batches_source_check check (source in ('instagram', 'maps', 'manual', 'instagram_profile'));
alter table batches
  -- @ do perfil (sem o @) e as listas pedidas.
  add column source_profile text,
  add column source_relations text[] not null default '{}' check (source_relations <@ array['following', 'followers']),
  -- País dos perfis (código ISO), para ler os telefones. Nulo: o das cidades do batch.
  add column country text,
  -- Execuções no Apify, uma por lista: [{ relation, run_id, dataset_id }].
  add column network_runs jsonb not null default '[]';
