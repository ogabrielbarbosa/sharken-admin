-- Enriquecimento do lead: e-mail e dados do dono achados no site, no WHOIS (registro.br) e no CNPJ.
-- `email` é o melhor e-mail encontrado; `enrichment` guarda tudo, com a fonte de cada dado.
-- `franchise` vem da análise da IA: franquia ou rede é descartada.
alter table leads add column if not exists email text;
alter table leads add column if not exists enrichment jsonb;
alter table leads add column if not exists franchise boolean;
