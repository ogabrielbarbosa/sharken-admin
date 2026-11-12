-- Um lead pode ter vários contatos (vários números do mesmo negócio). Cada contato continua com no máximo um lead.
alter table contacts drop constraint contacts_lead_id_key;
create index contacts_lead_idx on contacts (lead_id) where lead_id is not null;
