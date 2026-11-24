-- Link do Google Meu Negócio colado à mão no lead. O worker lê o lugar por ele e preenche o place_id.
-- Só acrescenta: o código publicado continua funcionando.
alter table leads add column maps_url text;
