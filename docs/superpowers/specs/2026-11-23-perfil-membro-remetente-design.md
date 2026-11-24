# Perfil do membro e remetente no chat

Status: aprovado pelo Gabriel em 2026-11-23.

## Intenção
Saber quem enviou cada mensagem pelo nome e pela foto, sem texto de remetente no balão. Hoje só há o começo do e-mail.

## Desenho
- Perfil por usuário (nome e foto), válido em todos os workspaces. Nome pedido no cadastro. Cada um edita o seu em Configurações › Membros; o dono edita o dos membros do workspace.
- A mensagem segue ligada ao usuário (`sent_by`): trocar nome ou foto atualiza o histórico. Sair do workspace não apaga o perfil. O e-mail já gravado é a reserva.
- Número e nome da conexão são gravados na mensagem no envio. Mensagens antigas: "não registrada".
- À direita do balão, a foto de quem enviou. Hover, foco ou toque abre um card: nome, e-mail, conexão, número e data/hora. Sem foto, iniciais; sem nome, e-mail. O texto do remetente some.
- Nota interna: mesma foto e card, sem conexão.
- Enviada pelo celular: foto do WhatsApp conectado e "Enviada pelo celular"; o membro é desconhecido.
- Foto em bucket privado do Supabase, com URL assinada.

## Restrições
Migração só acrescenta e é compatível com o código publicado (o banco local é o de produção). RLS: leitura pelo servidor; nada de escrita direta pelo cliente. Não entra: perfil por workspace, vários números por workspace, mudança na assinatura das mensagens (`[seu nome]`).

## Abordagens
1. **Perfil por usuário, lido ao vivo (escolhida):** histórico sempre atual.
2. Nome e foto copiados em cada mensagem: histórico desatualizado.
3. Perfil por workspace: configuração repetida.

## Fica com quem implementa
Nomes de tabela/colunas, limites e formatos da foto, posicionamento do card.
