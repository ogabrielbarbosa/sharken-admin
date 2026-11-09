# Sistema de prospecção

Monorepo com Turborepo e pnpm.

| Pasta | O que tem |
|---|---|
| `apps/web` | Painel e páginas de exemplo (Next.js, Vercel) |
| `apps/worker` | Worker que roda no Mac: análise de sites, geração de páginas e vídeos |
| `packages/domain` | Regras de negócio puras, com testes |
| `packages/db` | Acesso ao Supabase |
| `packages/integrations` | Apify, Claude, ElevenLabs, Pexels, ZapSign e Asaas |
| `packages/config` | Variáveis de ambiente, roteiros, mensagens e prompts |
| `packages/video` | Composição do vídeo (Remotion) |
| `supabase` | Configuração e migrações do banco |

Novos apps, como uma API ou um worker de mensagens, entram em `apps/` e reaproveitam os pacotes. A fila `jobs` é genérica: um novo worker só precisa tratar novos valores de `type`.

- Como rodar e os ambientes: [docs/ambientes.md](docs/ambientes.md)
- Vídeo, mensagens e contrato: [docs/operacao.md](docs/operacao.md)
- Spec e plano: `docs/superpowers/`

```bash
pnpm test        # todos os testes
pnpm typecheck   # tipos de todos os pacotes
```
