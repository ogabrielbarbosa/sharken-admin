# Sistema de prospecção

Monorepo com Turborepo e pnpm.

| Pasta | O que tem |
|---|---|
| `apps/web` | Painel (Next.js, Vercel) |
| `apps/worker` | Worker que roda no Mac: análise de sites e download de mídia |
| `packages/domain` | Regras de negócio puras, com testes |
| `packages/db` | Acesso ao Supabase |
| `packages/integrations` | Apify, Claude, Evolution, ZapSign e Asaas |
| `packages/config` | Variáveis de ambiente, mensagens e prompts |
| `supabase` | Configuração e migrações do banco |

Novos apps, como uma API ou um worker de mensagens, entram em `apps/` e reaproveitam os pacotes. A fila `jobs` é genérica: um novo worker só precisa tratar novos valores de `type`.

```bash
pnpm local      # roda tudo na sua máquina
pnpm producao   # publica na nuvem
```

- Como rodar e os ambientes: [docs/ambientes.md](docs/ambientes.md)
- Página e vídeo, mensagens e contrato: [docs/operacao.md](docs/operacao.md)
- Spec e plano: `docs/superpowers/`

```bash
pnpm test        # todos os testes
pnpm typecheck   # tipos de todos os pacotes
```
# sharken-admin
