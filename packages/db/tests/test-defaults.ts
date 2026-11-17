/**
 * Só nos testes: o SQL cru dos testes grava sem workspace; aqui ele cai no workspace padrão.
 * Em produção não há esse padrão (gravar sem workspace falha, desde a 0015).
 */
export const TEST_WORKSPACE_DEFAULTS = `
  do $$
  declare t text;
  begin
    foreach t in array array['batches', 'leads', 'contacts', 'clients', 'whatsapp_connection'] loop
      execute format('alter table %I alter column workspace_id set default legacy_default_workspace()', t);
    end loop;
  end $$;
`;
