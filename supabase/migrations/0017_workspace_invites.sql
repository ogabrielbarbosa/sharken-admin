-- Convites: o dono (ou o administrador) adiciona a pessoa pelo e-mail, sem senha. Quando ela cria a conta
-- com esse e-mail, entra direto no workspace. Só quem foi convidado consegue criar conta.
create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid,
  accepted_at timestamptz,
  unique (workspace_id, email)
);
create index workspace_invites_email_idx on workspace_invites (email) where accepted_at is null;

alter table workspace_invites enable row level security;
grant all on workspace_invites to service_role;
