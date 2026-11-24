-- Cidades fora do Brasil no batch: [{ location, country, lat, lng }]. Vazio = cidades do Brasil (lista do IBGE).
-- Só acrescenta: o código publicado continua funcionando.
alter table batches add column places jsonb not null default '[]';
