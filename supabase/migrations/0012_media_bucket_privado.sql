-- O bucket `media` era público e não é mais usado (sobra da geração automática de página e vídeo).
-- Fica privado: sem policy em storage.objects, só o service role acessa.
update storage.buckets set public = false where id = 'media';
