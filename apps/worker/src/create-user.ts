import './env';
import { createAdminClient } from '@lps/db';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: pnpm user:create <email> <senha>');
  process.exit(1);
}
const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error(`Não foi possível criar o usuário: ${error.message}`);
  process.exit(1);
}
console.log(`Usuário ${email} criado.`);
