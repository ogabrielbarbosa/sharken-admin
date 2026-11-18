-- Apify: cada workspace busca com a própria conta, com o próprio token.
--
-- workspace_apify guarda o token e a conta que ele representa. Só o servidor (service_role) lê:
-- membros não têm acesso direto, nem pelo Realtime.
create table workspace_apify (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  updated_at timestamptz not null default now(),
  token text not null,
  username text,
  plan text
);
alter table workspace_apify enable row level security;
grant all on workspace_apify to service_role;
