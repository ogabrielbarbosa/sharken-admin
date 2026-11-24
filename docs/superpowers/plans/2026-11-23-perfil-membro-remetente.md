# Perfil do membro e remetente no chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membro com nome e foto; no chat, a foto de quem enviou com um card de detalhes no hover.

**Architecture:** `user_profiles` por usuário, lida pelo servidor e cruzada com `messages.sent_by`. A conexão é copiada na mensagem dentro de `crm_insert_message`, o que cobre o painel e o celular. Um componente único mostra foto e card.

**Tech Stack:** Next.js, Supabase (Postgres, Storage), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-23-perfil-membro-remetente-design.md`

## Global Constraints
- Migração só acrescenta, compatível com o código publicado. O banco é o de produção: `pnpm db:migrate` só com autorização do Gabriel, e antes do `git push`.
- Foto: JPG, PNG ou WebP, até 2 MB, bucket privado `avatars`, URL assinada de 24 h. Nome: 2 a 80 caracteres.
- Só o servidor lê e grava perfis; RLS ligado, sem política para `authenticated`.
- Cada um edita o seu; o dono (ou admin da plataforma) edita os membros do workspace em uso.

## Review Focus
- Dono envia `user_id` de quem não é membro do workspace: recusa.
- Membro removido: as mensagens dele seguem com nome e foto.
- Número trocado depois do envio: a mensagem antiga mantém a conexão original.
- Arquivo que se diz imagem mas não é (SVG ou HTML): recusa pelos bytes.
- Foto com URL expirada ou mensagem sem remetente: iniciais ou foto da conexão, sem quebrar.

---

### Task 1: Banco e funções de perfil
**Files:** Create `supabase/migrations/0028_user_profiles.sql`, `packages/domain/src/profile.ts`, `packages/db/src/profiles.ts`, `packages/domain/tests/profile.test.ts`, `packages/db/tests/profiles.test.ts`. Modify índices de `domain` e `db`, `packages/domain/src/contacts.ts`, `packages/db/tests/migrations.test.ts` (nova tabela na lista, se exigido).

**Interfaces — Produces:**
- `messages.connection_phone text`, `connection_name text`, ambos `string | null` em `Message`.
- `user_profiles(user_id uuid pk, name text, avatar_path text, updated_at timestamptz)`, sem FK (o perfil sobrevive à conta); `grant all` só a `service_role`.
- `parseProfileName(raw: string): string` (apara; lança `O nome precisa ter entre 2 e 80 caracteres.`)
- `avatarMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null` (assinatura do arquivo).
- `type MemberProfile = { userId: string; name: string | null; avatarUrl: string | null }`
- `listProfiles(db: Db, userIds: string[]): Promise<Map<string, MemberProfile>>`
- `saveProfile(db: Db, userId: string, patch: { name?: string; avatarPath?: string | null }): Promise<void>` (upsert parcial)
- `uploadAvatar(db: Db, userId: string, bytes: Uint8Array): Promise<string>`: valida, grava em `<userId>/<uuid>`, devolve o caminho. Arquivo recusado: `Envie uma imagem JPG, PNG ou WebP de até 2 MB.`

- [ ] Testes: `parseProfileName('  Ana Lima ') === 'Ana Lima'`, recusa `'A'` e 81 caracteres; `avatarMime` dos três formatos e `null` para `<svg>`; `saveProfile` só com nome preserva `avatar_path`; `listProfiles([])` devolve mapa vazio; saída grava `connection_phone/name` da conexão do workspace, mudar a conexão não altera a linha, entrada fica nula; dois workspaces não se misturam.
- [ ] `pnpm --filter @lps/db --filter @lps/domain test` → FAIL.
- [ ] Implementar. A migração copia `crm_insert_message` da 0026 e, com `direction = 'saida'`, lê `phone, profile_name` de `whatsapp_connection` pelo `workspace_id` do contato. Cria o bucket `avatars` privado.
- [ ] Mesmo comando → PASS. Commit `feat(db): perfil do usuário e conexão da mensagem`.

### Task 2: Cadastro e Configurações › Membros
**Files:** Modify `apps/web/src/app/cadastro/page.tsx`, `apps/web/src/app/login/actions.ts`, `apps/web/src/app/painel/configuracoes/{actions.ts,page.tsx}`. Create `apps/web/src/lib/profile-access.ts` e o teste `apps/web/src/lib/profile-access.test.ts` (ou a pasta de testes já usada pelo web).

**Interfaces — Consumes:** Task 1. **Produces:** `saveProfileAction(formData)` (`user_id`, `name`, `avatar`, `remove_avatar`); `canEditProfile(input: { me: string; target: string; canManage: boolean; memberIds: string[] }): boolean`.

- [ ] Teste: próprio → true; dono e membro → true; dono e não membro → false; membro e outro → false. Rodar `pnpm --filter @lps/web test` → FAIL.
- [ ] Implementar. O admin da plataforma pode não ser membro do workspace: ganha um cartão "Meu perfil" no topo da aba. Cada linha mostra foto, nome, e-mail e "Editar" (`<details>` com nome e arquivo). A ação confere a permissão no servidor e remove a foto antiga do bucket. Cadastro pede "Nome" e chama `saveProfile` depois de criar a conta.
- [ ] Teste e `pnpm typecheck` → PASS. Commit `feat(web): nome e foto dos membros`.

### Task 3: Foto e card no chat
**Files:** Create `apps/web/src/components/crm/sender-avatar.tsx` e o teste de `senderInfo` junto de `apps/web/src/lib/sender-info.ts`. Modify `thread.tsx`, `conversation.tsx`, `painel/crm/page.tsx`.

**Interfaces — Consumes:** `MemberProfile`, `listProfiles`. **Produces:** `senderInfo(m: ThreadMessage, profiles: Record<string, MemberProfile>, connection: { name: string | null; avatar: string | null }): { title: string; email: string | null; avatar: string | null; seed: string; connection: string | null }`; `SenderAvatar({ m, people })`; `ThreadPeople.profiles: Record<string, MemberProfile>`.

- [ ] Testes: com perfil → nome e foto; sem nome → e-mail; `celular` → `Enviada pelo celular` com a foto da conexão; saída antiga sem `sent_by` → `Remetente não registrado` com a foto da conexão; sem conexão → `não registrada`; nota → `connection: null`. FAIL.
- [ ] Implementar. `page.tsx` carrega os perfis dos `sent_by` distintos mais o usuário atual. A mensagem otimista leva os campos de conexão. Remover `Sender`; `SenderAvatar` em saída, saída com erro e nota. Card abre em hover, foco e clique, fecha com Esc e em portal, para não ser cortado pela rolagem. O player de áudio usa a mesma foto. Manter `sameSender`.
- [ ] `pnpm test && pnpm typecheck && pnpm build` → PASS. Conferir no navegador só depois de a migração ser autorizada. Atualizar a decisão de membros no `CLAUDE.md`. Commit `feat(crm): foto e detalhes de quem enviou`.
