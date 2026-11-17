-- Configurações do workspace e administradores da plataforma.
--
-- commercial_name: nome da empresa que aparece nas mensagens ($empresa).
-- signature_name: quem fala nas mensagens ("Aqui é o [seu nome]") e a assinatura do CRM.
-- daily_first_contact_limit: aviso de primeiros contatos por dia (vazio = DAILY_FIRST_CONTACT_LIMIT do .env).
alter table workspaces
  add column commercial_name text,
  add column signature_name text,
  add column daily_first_contact_limit int check (daily_first_contact_limit is null or daily_first_contact_limit > 0);

update workspaces set commercial_name = 'Sharken', signature_name = 'Gabriel' where slug = 'sharken';

-- Administrador da plataforma: vê e alterna entre todos os workspaces e cria novos.
-- Os demais usuários só enxergam o próprio workspace.
create table platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    execute 'alter table platform_admins add constraint platform_admins_user_fk foreign key (user_id) references auth.users (id) on delete cascade';
  end if;
end $$;

-- Quem já é dono do workspace original (o Gabriel) vira administrador.
insert into platform_admins (user_id)
select m.user_id from workspace_members m join workspaces w on w.id = m.workspace_id
where w.slug = 'sharken' and m.role = 'owner'
on conflict do nothing;

alter table platform_admins enable row level security;
grant all on platform_admins to service_role;
