import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');
const file = join(root, '.env');
if (existsSync(file)) process.loadEnvFile(file);

export const ROOT_DIR = root;
