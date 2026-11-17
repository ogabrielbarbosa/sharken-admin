-- AbacatePay: cada workspace cobra na própria conta, com a própria chave.
--
-- workspace_billing guarda a chave de API e o webhook do workspace. Só o servidor (service_role) lê:
-- membros não têm acesso direto, nem pelo Realtime.
create table workspace_billing (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  updated_at timestamptz not null default now(),
  api_key text not null,
  dev_mode boolean not null default false,
  webhook_id text,
  webhook_secret text not null
);
alter table workspace_billing enable row level security;
grant all on workspace_billing to service_role;

-- Catálogo de serviços do workspace: o que se vende, com preço e periodicidade, para preencher o Fechar negócio.
create table service_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('unico', 'recorrente')),
  amount_cents int not null check (amount_cents > 0),
  cycle text check (cycle in ('mensal', 'trimestral', 'semestral', 'anual')),
  description text,
  active boolean not null default true,
  check (kind = 'unico' or cycle is not null)
);
create index service_catalog_workspace_idx on service_catalog (workspace_id);
alter table service_catalog enable row level security;
grant all on service_catalog to authenticated, service_role;
create policy service_catalog_member on service_catalog for all to authenticated
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

-- Serviço recorrente: o checkout de assinatura (bill_...) e, depois do primeiro pagamento, a assinatura (subs_...).
alter table services
  add column abacate_checkout_id text unique,
  add column abacate_subscription_id text unique;

-- Cobrança: o checkout (bill_...) e o pagamento confirmado. Numa assinatura, todas as cobranças têm o mesmo
-- checkout, e cada renovação chega com um pagamento novo.
alter table charges
  add column abacate_checkout_id text,
  add column abacate_payment_id text unique;
create index charges_abacate_checkout_idx on charges (abacate_checkout_id) where abacate_checkout_id is not null;

-- Marca como vencidas as cobranças da AbacatePay pendentes com vencimento antes de `today`
-- (a AbacatePay não avisa atraso; o Asaas avisa sozinho). Chamada pelo cron diário.
create or replace function mark_overdue_charges(today date) returns int language sql as $$
  with changed as (
    update charges set status = 'vencido'
    where status = 'pendente' and asaas_payment_id is null and due_date < today
    returning 1
  )
  select count(*)::int from changed;
$$;
revoke all on function mark_overdue_charges(date) from public, anon, authenticated;
grant execute on function mark_overdue_charges(date) to service_role;
