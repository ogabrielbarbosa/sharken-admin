-- Mensagens rápidas do CRM, por workspace (Configurações › Mensagens rápidas). Antes eram um arquivo fixo.
-- O servidor grava com service_role; membros só leem.
create table quick_replies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  position int not null default 0,
  active boolean not null default true
);
create unique index quick_replies_workspace_shortcut_key on quick_replies (workspace_id, shortcut);
alter table quick_replies enable row level security;
grant select on quick_replies to authenticated;
grant all on quick_replies to service_role;
create policy quick_replies_member_read on quick_replies for select to authenticated using (is_workspace_member(workspace_id));

-- Os workspaces que já existem começam com as mensagens que usavam até aqui.
insert into quick_replies (workspace_id, shortcut, title, body, position)
select w.id, v.shortcut, v.title, v.body, v.position
from workspaces w
cross join (values
  ('oi', 'Cumprimento', 'Oi, $primeiro_nome! Tudo bem? Aqui é o $meu_nome, da $empresa.', 0),
  ('link', 'Link da página', 'Aqui está a página que preparei: $link', 1),
  ('ligar', 'Pedir um horário para ligar', 'Posso te ligar rapidinho para explicar? Qual o melhor horário para você?', 2),
  ('obrigado', 'Agradecer', 'Obrigado pelo retorno, $primeiro_nome! Qualquer dúvida, é só me chamar por aqui.', 3),
  ('parar', 'Confirmar que não vai mais mandar', 'Sem problemas, não vou mais te mandar mensagem. Obrigado!', 4)
) as v (shortcut, title, body, position);
