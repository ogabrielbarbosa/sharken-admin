-- Batch manual: os leads são cadastrados à mão, sem busca. Só acrescenta um valor aceito.
alter table batches drop constraint batches_source_check;
alter table batches add constraint batches_source_check check (source in ('instagram', 'maps', 'manual'));
