-- O token que o cliente MCP recebe pelo OAuth do Supabase é uma sessão `authenticated` comum:
-- sem esta migração ele poderia gravar pela REST (PostgREST) nas tabelas que o painel grava.
-- Os tokens OAuth trazem a claim `client_id`; as sessões do painel não. Políticas restritivas
-- por comando (insert/update/delete) negam a escrita a quem tem `client_id`; o select segue igual.
-- O servidor e o worker usam service_role e não passam por RLS.

-- plpgsql: o corpo só é resolvido na chamada (o banco de testes PGlite não tem o schema auth),
-- como em is_workspace_member.
create or replace function is_oauth_session() returns boolean language plpgsql stable as $$
begin
  return coalesce(auth.jwt() ->> 'client_id', '') <> '';
end $$;
revoke all on function is_oauth_session() from public, anon;
grant execute on function is_oauth_session() to authenticated, service_role;

-- Descobre as tabelas pelas políticas existentes (inclui as antigas `<t>_authenticated` e as
-- de migrações posteriores). Idempotente.
do $$
declare t text;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and 'authenticated' = any(roles) and cmd <> 'SELECT' and permissive = 'PERMISSIVE'
  loop
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_write_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_write_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_write_del', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not is_oauth_session())', t || '_no_oauth_write_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not is_oauth_session())', t || '_no_oauth_write_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not is_oauth_session())', t || '_no_oauth_write_del', t);
  end loop;
end $$;
