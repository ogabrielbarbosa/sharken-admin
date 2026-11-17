import './env';
import { createAdminClient } from '@lps/db';

// pnpm user:create <email> <senha> [workspace]  — o workspace é o slug (padrão: sharken).
const [email, password, slug = 'sharken'] = process.argv.slice(2).filter((a) => a !== '--');
if (!email || !password) {
  console.error('Uso: pnpm user:create <email> <senha> [workspace]');
  process.exit(1);
}
const db = createAdminClient();
const { data: ws } = await db.from('workspaces').select('id, name').eq('slug', slug).maybeSingle();
if (!ws) {
  console.error(`Workspace ${slug} não encontrado.`);
  process.exit(1);
}
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !data.user) {
  console.error(`Não foi possível criar o usuário: ${error?.message}`);
  process.exit(1);
}
const { error: memberError } = await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: data.user.id, role: 'owner' });
if (memberError) {
  console.error(`Usuário criado, mas não entrou no workspace: ${memberError.message}`);
  process.exit(1);
}
console.log(`Usuário ${email} criado no workspace ${ws.name}.`);
