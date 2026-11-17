-- Imagens do Instagram do lead (foto de perfil e últimos posts), salvas no Cloudflare R2 quando o lead
-- vira Qualificado. Os links do Instagram expiram em poucos dias; aqui ficam os links do R2, que não expiram.
-- Cada item: { kind: 'perfil' | 'post', url, post_url, caption, taken_at }.
alter table leads add column instagram_media jsonb not null default '[]'::jsonb;
