-- Execuções do Apify iniciadas pelo Sharken, para separar o gasto dele do de outros projetos na mesma conta.
-- O valor não fica aqui: vem do Apify. Só o servidor (service_role) lê. Compatível com o código anterior.
create table apify_runs (
  run_id text primary key,
  created_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  actor text not null,
  purpose text not null,
  batch_id uuid references batches (id) on delete set null,
  lead_id uuid references leads (id) on delete set null,
  -- Ligada depois, a partir dos ids guardados no batch.
  backfilled boolean not null default false
);
create index apify_runs_workspace_idx on apify_runs (workspace_id, created_at);
alter table apify_runs enable row level security;
grant all on apify_runs to service_role;

insert into apify_runs (run_id, created_at, workspace_id, actor, purpose, batch_id, backfilled)
select r.run_id, b.created_at, b.workspace_id, r.actor, r.purpose, b.id, true
from batches b
cross join lateral (values
  (b.apify_run_id, 'compass/crawler-google-places', 'maps'),
  (b.google_run_id, 'apify/google-search-scraper', 'google'),
  (b.profiles_run_id, 'apify/instagram-profile-scraper', 'profiles'),
  (b.instagram_run_id, 'apify/instagram-profile-scraper', 'instagram')
) as r(run_id, actor, purpose)
where r.run_id is not null
on conflict do nothing;
