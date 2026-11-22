-- Prospecção com o Instagram no centro, etapa 1 (spec 2026-11-22-prospeccao-instagram-design.md).
--
-- 1. Chaves para reconhecer o mesmo negócio vindo de fontes diferentes: @ do Instagram e domínio do site,
--    calculadas pelo banco a cada gravação (o código não precisa lembrar). As mesmas regras estão em
--    packages/domain/src/lead-keys.ts; o teste lead-keys.test.ts do pacote db compara as duas.
-- 2. batch_leads: um lead pode aparecer em vários batches. Por enquanto o quadro segue lendo leads.batch_id
--    (o batch de origem); a importação já grava aqui.
-- 3. place_id opcional: lead que vem só do Instagram não tem lugar no Google Maps.
-- Só acrescenta: o código publicado continua funcionando.

create or replace function lead_instagram_handle(url text) returns text language plpgsql immutable as $$
declare h text;
begin
  h := lower((regexp_match(url, 'instagram\.com/@?([a-z0-9._]{1,30})', 'i'))[1]);
  if h = any (array[
    'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal',
    'developer', 'share', 's', 'web', 'privacy', 'terms', 'instagram', 'oauth', 'challenge'
  ]) then return null; end if;
  return h;
end $$;

create or replace function lead_site_domain(url text) returns text language plpgsql immutable as $$
declare
  host text;
  d text;
begin
  host := lower((regexp_match(btrim(url), '^(?:[a-z][a-z0-9+.-]*://)?([^/:?#\s]+)', 'i'))[1]);
  host := regexp_replace(host, '^www\.', '');
  if host is null or position('.' in host) = 0 then return null; end if;
  foreach d in array array[
    'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'beacons.ai', 'bio.site',
    'wa.me', 'whatsapp.com', 'tiktok.com', 'youtube.com', 'ifood.com.br',
    'google.com', 'goo.gl', 'g.page', 'bit.ly', 'doctoralia.com.br', 'taplink.cc'
  ] loop
    if host = d or host like '%.' || d then return null; end if;
  end loop;
  return host;
end $$;

alter table leads
  add column instagram_handle text,
  add column site_domain text;

create or replace function set_lead_keys() returns trigger language plpgsql as $$
begin
  new.instagram_handle := lead_instagram_handle(new.instagram_url);
  new.site_domain := lead_site_domain(new.website_url);
  return new;
end $$;

create trigger leads_keys before insert or update of instagram_url, website_url on leads
  for each row execute function set_lead_keys();

-- Sem disparar o trigger de updated_at, para não mexer na data real de cada lead.
alter table leads disable trigger leads_updated_at;
update leads set instagram_handle = lead_instagram_handle(instagram_url), site_domain = lead_site_domain(website_url);
alter table leads enable trigger leads_updated_at;

create index leads_workspace_instagram_idx on leads (workspace_id, instagram_handle) where instagram_handle is not null;
create index leads_workspace_domain_idx on leads (workspace_id, site_domain) where site_domain is not null;
create index leads_workspace_phone_idx on leads (workspace_id, phone_e164) where phone_e164 is not null;

alter table leads alter column place_id drop not null;

create table batch_leads (
  batch_id uuid not null references batches (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  found_at timestamptz not null default now(),
  -- O lead já existia (encontrado por outro batch) quando este o encontrou.
  already_known boolean not null default false,
  primary key (batch_id, lead_id)
);
create index batch_leads_lead_idx on batch_leads (lead_id);
create index batch_leads_workspace_idx on batch_leads (workspace_id);
alter table batch_leads enable row level security;
grant select on batch_leads to authenticated;
grant all on batch_leads to service_role;
create policy batch_leads_member_read on batch_leads for select to authenticated using (is_workspace_member(workspace_id));

insert into batch_leads (batch_id, lead_id, workspace_id, found_at)
select batch_id, id, workspace_id, created_at from leads where batch_id is not null
on conflict do nothing;
