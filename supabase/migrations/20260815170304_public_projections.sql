-- AIDENTITY — proiezioni pubbliche per le sette tabelle contenuto mancanti.
-- Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md §5 (forme contenuto v1) e §6 (RLS).
--
-- PR-0 aveva proiettato soltanto `public_sites` e `public_tracks`: FEED, EPK e MERCH
-- restavano illeggibili ad `anon`. Qui si chiude il buco seguendo il modello §6:
-- viste `security_invoker`, policy RLS per `anon` e grant di colonna sulle sole
-- colonne pubbliche sottostanti. Nessuna riga di PR-0 viene modificata.
--
-- Tre invarianti attraversano tutto il file:
--   1. una riga è pubblica solo se il suo sito è `published`;
--   2. un asset o una traccia purgati non sono contenuto disponibile (§4, §5);
--   3. un contatto senza `consent_confirmed_at` non esiste per il pubblico (§2, §6.3):
--      il consenso è un filtro di riga, non una colonna da nascondere.
--
-- Media: le proiezioni espongono l'identificativo dell'asset e i suoi attributi
-- pubblici, mai `storage_path`. I bucket restano privati; il file si raggiunge da una
-- route server che verifica `published` e firma un URL a vita breve (altro filone).

-- ---------------------------------------------------------------------------
-- 1. Predicato di consenso.
-- `consent_confirmed_at` è campo interno per §6.3: ad `anon` non va concesso alcun
-- privilegio su quella colonna, nemmeno per valutare la WHERE di una vista
-- `security_invoker`. Il predicato vive quindi in `private` (§6.7): la vista lo
-- invoca, `anon` non può invocarlo direttamente perché non ha USAGE sullo schema.
-- ---------------------------------------------------------------------------
create or replace function private.contact_is_public(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_contacts c
    join public.sites s on s.id = c.site_id
    where c.id = target
      and c.consent_confirmed_at is not null
      and s.publication_status = 'published'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Policy RLS per `anon`: stesse condizioni delle viste, applicate alla riga.
-- La vista non è l'unico guardiano: anche una lettura diretta delle sole colonne
-- pubbliche non può restituire un draft, un file purgato o un contatto senza consenso.
-- ---------------------------------------------------------------------------
create policy assets_public on public.site_assets for select to anon
  using (purged_at is null and exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy tracks_public on public.site_tracks for select to anon
  using (purged_at is null and exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy posts_public on public.site_posts for select to anon
  using (exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy links_public on public.site_links for select to anon
  using (exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy press_public on public.site_press for select to anon
  using (exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy dates_public on public.site_dates for select to anon
  using (exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy metrics_public on public.site_metrics for select to anon
  using (exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));
create policy contacts_public on public.site_contacts for select to anon
  using (consent_confirmed_at is not null and exists (select 1 from public.sites s where s.id = site_id and s.publication_status = 'published'));

-- ---------------------------------------------------------------------------
-- 3. Proiezioni. Il filtro sta nella vista, non solo nella policy: anche un
-- invocante `authenticated` che legge la proiezione del proprio sito vede
-- soltanto ciò che è pubblico.
-- ---------------------------------------------------------------------------

-- HOME/EPK: identificativo e attributi pubblici dell'asset. Mai path, byte, MIME.
create view public.public_assets with (security_invoker = true) as
select a.id, a.site_id, a.kind, a.sort_order
from public.site_assets a
join public.sites s on s.id = a.site_id
where s.publication_status = 'published' and a.purged_at is null;

-- FEED: un post vale solo finché il media che mostra esiste ancora.
-- Un post `visual` con asset purgato sparisce; un post `track` con traccia purgata
-- sparisce; una cover purgata non fa sparire il post, si annulla il riferimento.
create view public.public_posts with (security_invoker = true) as
select p.id, p.site_id, p.kind, p.caption, p.sort_order,
       va.id as visual_asset_id, cov.id as cover_asset_id, t.id as track_id
from public.site_posts p
join public.sites s on s.id = p.site_id
left join public.site_assets va on va.site_id = p.site_id and va.id = p.visual_asset_id and va.purged_at is null
left join public.site_assets cov on cov.site_id = p.site_id and cov.id = p.cover_asset_id and cov.purged_at is null
left join public.site_tracks t on t.site_id = p.site_id and t.id = p.track_id and t.purged_at is null
where s.publication_status = 'published'
  and (p.kind <> 'visual' or va.id is not null)
  and (p.kind <> 'track' or t.id is not null);

create view public.public_links with (security_invoker = true) as
select l.id, l.site_id, l.provider, l.url, l.sort_order
from public.site_links l
join public.sites s on s.id = l.site_id
where s.publication_status = 'published';

create view public.public_press with (security_invoker = true) as
select pr.id, pr.site_id, pr.publication, pr.quote, pr.published_on, pr.url, pr.sort_order
from public.site_press pr
join public.sites s on s.id = pr.site_id
where s.publication_status = 'published';

create view public.public_dates with (security_invoker = true) as
select d.id, d.site_id, d.starts_at, d.city, d.venue, d.ticket_url, d.sort_order
from public.site_dates d
join public.sites s on s.id = d.site_id
where s.publication_status = 'published';

create view public.public_metrics with (security_invoker = true) as
select m.id, m.site_id, m.label, m.value, m.sort_order
from public.site_metrics m
join public.sites s on s.id = m.site_id
where s.publication_status = 'published';

-- EPK: pubblicare l'email di chi non ha confermato è il rischio isolato in L0 §8.
-- Il consenso è il filtro; le colonne del consenso non compaiono qui né altrove.
create view public.public_contacts with (security_invoker = true) as
select c.id, c.site_id, c.role, c.name, c.email, c.sort_order
from public.site_contacts c
join public.sites s on s.id = c.site_id
where s.publication_status = 'published' and private.contact_is_public(c.id);

-- Sitemap: `lastModified` mancava perché nessuna proiezione esponeva un istante.
-- Copre identità, tema, configurazione e stato di pubblicazione del sito; NON le
-- righe contenuto, che hanno un proprio `updated_at` non proiettato.
create view public.public_site_meta with (security_invoker = true) as
select s.id, s.slug, greatest(s.updated_at, c.updated_at) as updated_at
from public.sites s
join public.site_config c on c.site_id = s.id
where s.publication_status = 'published';

-- ---------------------------------------------------------------------------
-- 4. Grant minimi.
-- `anon` non riceve mai SELECT a livello tabella: solo le colonne pubbliche, più
-- le colonne che la WHERE della vista deve valutare (`purged_at`, sempre NULL nelle
-- righe che la policy gli lascia vedere; `updated_at`, che è il dato pubblicato).
-- `site_tracks` compare qui perché `public_tracks` di PR-0 non era leggibile da
-- `anon`: la vista esisteva, i privilegi sottostanti no.
-- ---------------------------------------------------------------------------
grant select (id, site_id, kind, sort_order, purged_at) on public.site_assets to anon;
grant select (id, site_id, title, source, duration_seconds, embed_provider, embed_url, sort_order, purged_at) on public.site_tracks to anon;
grant select (id, site_id, kind, caption, sort_order, visual_asset_id, cover_asset_id, track_id) on public.site_posts to anon;
grant select (id, site_id, provider, url, sort_order) on public.site_links to anon;
grant select (id, site_id, publication, quote, published_on, url, sort_order) on public.site_press to anon;
grant select (id, site_id, starts_at, city, venue, ticket_url, sort_order) on public.site_dates to anon;
grant select (id, site_id, label, value, sort_order) on public.site_metrics to anon;
grant select (id, site_id, role, name, email, sort_order) on public.site_contacts to anon;
grant select (updated_at) on public.sites to anon;
grant select (updated_at) on public.site_config to anon;

grant execute on function private.contact_is_public(uuid) to anon, authenticated;

grant select on
  public.public_assets, public.public_posts, public.public_links, public.public_press,
  public.public_dates, public.public_metrics, public.public_contacts, public.public_site_meta
to anon, authenticated, service_role;
