-- Prospecção com o Instagram no centro, etapas 3 a 7 (spec 2026-11-22-prospeccao-instagram-design.md).
-- Só acrescenta: o código publicado continua funcionando (batches antigos ficam com source = 'maps').

-- Fonte do batch (Instagram por padrão no código novo; dá para rodar a outra depois), várias cidades e as
-- variações usadas na busca do Instagram pelo Google. google_run_id e profiles_run_id são as execuções no Apify.
alter table batches
  add column source text not null default 'maps' check (source in ('instagram', 'maps')),
  add column locations text[] not null default '{}',
  add column niche_terms text[] not null default '{}',
  add column location_terms text[] not null default '{}',
  add column google_run_id text,
  add column profiles_run_id text;

-- Não contatar também pelo @ do Instagram (lead que veio só do Instagram não tem place_id).
alter table do_not_contact add column instagram_handle text unique;

-- Variações de nicho e de localização que o Gabriel aprovou ("lente dental" → "lentes dentais", "facetas"...).
-- A busca por texto parecido é feita no código (poucas linhas por workspace).
create table search_terms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('nicho', 'local')),
  label text not null,
  variants text[] not null default '{}'
);
create unique index search_terms_workspace_kind_label_key on search_terms (workspace_id, kind, label);
alter table search_terms enable row level security;
grant select on search_terms to authenticated;
grant all on search_terms to service_role;
create policy search_terms_member_read on search_terms for select to authenticated using (is_workspace_member(workspace_id));

-- Pares que o Gabriel marcou como "não são o mesmo negócio" (somem da lista de possíveis duplicados).
create table lead_duplicate_dismissals (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_a uuid not null references leads (id) on delete cascade,
  lead_b uuid not null references leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_a, lead_b),
  check (lead_a < lead_b)
);
create index lead_duplicate_dismissals_workspace_idx on lead_duplicate_dismissals (workspace_id);
alter table lead_duplicate_dismissals enable row level security;
grant select on lead_duplicate_dismissals to authenticated;
grant all on lead_duplicate_dismissals to service_role;
create policy lead_duplicate_dismissals_member_read on lead_duplicate_dismissals for select to authenticated using (is_workspace_member(workspace_id));

-- Todo lead novo com batch de origem já aparece nele, venha de onde vier a gravação (inclui o código antigo).
create or replace function link_lead_to_origin_batch() returns trigger language plpgsql as $$
begin
  if new.batch_id is not null then
    insert into batch_leads (batch_id, lead_id, workspace_id, found_at)
    values (new.batch_id, new.id, new.workspace_id, new.created_at)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger leads_link_origin_batch after insert on leads
  for each row execute function link_lead_to_origin_batch();

-- Batches rodados entre a 0023 e este gatilho.
insert into batch_leads (batch_id, lead_id, workspace_id, found_at)
select batch_id, id, workspace_id, created_at from leads where batch_id is not null
on conflict do nothing;
