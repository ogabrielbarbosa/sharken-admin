-- Páginas publicadas pelo agente (MCP `publicar_pagina`): o HTML fica aqui e é servido em
-- pages.sharkenapps.com/<id>. Sem expires_at, não expira. Quem grava é só o servidor (service_role);
-- membros do workspace leem pelo painel.
create table pages (
  id text primary key check (id ~ '^[A-Za-z0-9]{6,32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,
  title text,
  html text not null,
  expires_at timestamptz,
  created_by uuid
);
create index pages_workspace_idx on pages (workspace_id);
create index pages_lead_idx on pages (lead_id);
alter table pages enable row level security;
grant select on pages to authenticated;
grant all on pages to service_role;
create policy pages_member_read on pages for select to authenticated using (is_workspace_member(workspace_id));
