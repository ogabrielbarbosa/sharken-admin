-- Notas internas na conversa: ficam na linha do tempo do chat, nunca vão para o WhatsApp
-- e não mexem na prévia, nas não lidas nem no estado do atendimento (gravadas sem crm_insert_message).
alter table messages drop constraint messages_direction_check;
alter table messages add constraint messages_direction_check check (direction in ('entrada', 'saida', 'nota'));
