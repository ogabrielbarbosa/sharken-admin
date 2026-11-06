// Salva os dados do banco local em backups/, fora do Docker e fora do git.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync('backups', { recursive: true });
const file = `backups/local-${stamp}.sql`;
execFileSync('pnpm', ['exec', 'supabase', 'db', 'dump', '--local', '--data-only', '--use-copy', '-f', file], { stdio: 'inherit' });
console.log(`Backup salvo em ${file}`);
