# Custos do Apify

Aprovado pelo Gabriel em 2026-11-24 (abordagem B).

**Por quê:** o crédito acaba e não dá para saber com o quê. Em 24/11, 89% do ciclo era do `instagram-scraper`, que o Sharken não usa: a conta é dividida com outros projetos.

**O que:** Configurações › Custos, só para o dono, com o token já salvo. Uso e limite do ciclo, divisão entre Sharken, outros projetos e não identificado, gasto por dia, por ator e por batch. O primeiro programa é o Apify; outros entram como novas seções.

**Abordagens:** A, só consultar o Apify (não separa atores usados por mais de um projeto); **B, consultar e registrar as execuções do Sharken (escolhida)**; C, copiar o histórico (só para guardar além da retenção do Apify).

**Como:**
- `apify_runs` (só o servidor lê) guarda o id de cada execução, o uso, o batch e o lead. O valor vem sempre do Apify. Falha ao registrar não impede a busca.
- A leitura síncrona passa a iniciar a execução e esperar, para saber o id.
- A migração liga as execuções gravadas nos batches (`backfilled`).
- Registrada = Sharken. Ator que o Sharken não usa = outros. Ator compartilhado sem registro = não identificado antes do primeiro registro novo; depois dele, outros.
- O total do ciclo vem de `users/me/limits`; a diferença para a soma das execuções aparece como armazenamento e outros.
- Cache de 5 minutos. Falha do Apify mostra aviso, nunca zero.

**Fora:** reduzir o consumo, alertas, conversão para reais, outros programas, limite por projeto.
