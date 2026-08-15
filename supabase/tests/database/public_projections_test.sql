-- AIDENTITY — proiezioni pubbliche: contratto di colonne, filtri e privilegi.
--
-- Il banco non è fatto di soli casi validi. La fixture contiene apposta righe che
-- NON devono comparire da nessuna parte:
--   · un sito `draft` (owner B) con contenuto completo, contatto consentito incluso;
--   · un contatto del sito pubblicato SENZA `consent_confirmed_at`;
--   · un asset e una traccia con `purged_at` valorizzato, e i post che li mostrano.
--
-- Ogni vista è verificata per ENUMERAZIONE: l'insieme delle colonne esposte deve
-- essere esattamente l'allowlist dichiarata qui. Una colonna aggiunta domani a una
-- tabella base non può scivolare dentro una proiezione in silenzio.
--
-- NOTA su email e URL embed della fixture (contengono una barra rovesciata):
-- il CHECK di `site_contacts.email` e `private.valid_embed_url` di PR-0 usano `\\.`
-- dentro stringhe standard-conforming, quindi pretendono una barra rovesciata
-- letterale nel valore: nessuna email o URL provider ordinaria li supera. La fixture
-- usa valori che il vincolo attuale accetta. Non "correggere" queste stringhe senza
-- prima correggere i vincoli in PR-0: il test diventerebbe rosso per il motivo sbagliato.

begin;
select plan(97);

-- ---------------------------------------------------------------------------
-- Fixture. Sito A = 2222… (published), sito B = 5555… (draft).
-- ---------------------------------------------------------------------------
insert into public.site_assets (id, site_id, kind, storage_path, mime_type, byte_size, sort_order) values
  ('a1a1a1a1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','visual','test/a-visual.jpg','image/jpeg',2048,1),
  ('a1a1a1a1-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','photo_hi','test/a-purged.jpg','image/jpeg',4096,2);
update public.site_assets set purged_at = now() where id = 'a1a1a1a1-0000-0000-0000-000000000002';

insert into public.site_tracks (id, site_id, title, source, storage_path, mime_type, byte_size, duration_seconds, sort_order) values
  ('b1b1b1b1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Traccia caricata','upload','test/a-track.mp3','audio/mpeg',3072,181,0),
  ('b1b1b1b1-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Traccia purgata','upload','test/a-purged.mp3','audio/mpeg',3072,120,1);
update public.site_tracks set purged_at = now() where id = 'b1b1b1b1-0000-0000-0000-000000000002';
insert into public.site_tracks (id, site_id, title, source, embed_provider, embed_url, sort_order) values
  ('b1b1b1b1-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','Traccia embed','embed','spotify','https://open\.spotify\.com/track/fixture',2);

insert into public.site_posts (id, site_id, kind, visual_asset_id, track_id, cover_asset_id, caption, sort_order) values
  ('c1c1c1c1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','visual','a1a1a1a1-0000-0000-0000-000000000001',null,null,'post visual valido',0),
  ('c1c1c1c1-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','visual','a1a1a1a1-0000-0000-0000-000000000002',null,null,'post con visual purgato',1),
  ('c1c1c1c1-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','track',null,'b1b1b1b1-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','post track valido',2),
  ('c1c1c1c1-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','track',null,'b1b1b1b1-0000-0000-0000-000000000002',null,'post con traccia purgata',3),
  ('c1c1c1c1-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','track',null,'b1b1b1b1-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000002','post track con cover purgata',4);

insert into public.site_links (id, site_id, provider, url, sort_order) values
  ('d1d1d1d1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','spotify','https://open.spotify.com/artist/fixture',0);
insert into public.site_press (id, site_id, publication, quote, published_on, url, sort_order) values
  ('e1e1e1e1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Rivista A','Citazione A','2026-01-15','https://rivista.test/a',0);
insert into public.site_dates (id, site_id, starts_at, city, venue, ticket_url, sort_order) values
  ('f1f1f1f1-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','2026-11-20T21:00:00+01:00','Milano','Circolo A','https://tickets.test/a',0);
insert into public.site_metrics (id, site_id, label, value, sort_order) values
  ('01010101-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Ascoltatori mensili','12.000',0);
insert into public.site_contacts (id, site_id, role, name, email, consent_confirmed_at, consent_confirmed_by, sort_order) values
  ('02020202-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','booking','Booker Consenziente','booking@nvll\.test',now(),'11111111-1111-1111-1111-111111111111',0);
insert into public.site_contacts (id, site_id, role, name, email, sort_order) values
  ('02020202-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','press','Ufficio Stampa Senza Consenso','press@nvll\.test',1);

-- Sito B: draft con contenuto completo e contatto CONSENZIENTE. Nulla di questo è pubblico.
insert into public.site_posts (id, site_id, kind, visual_asset_id, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','visual','66666666-6666-6666-6666-666666666666',0);
insert into public.site_links (id, site_id, provider, url, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','tiktok','https://tiktok.test/draft',0);
insert into public.site_press (id, site_id, publication, quote, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000003','55555555-5555-5555-5555-555555555555','Rivista B','Citazione B',0);
insert into public.site_dates (id, site_id, starts_at, city, venue, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000004','55555555-5555-5555-5555-555555555555','2026-12-01T21:00:00+01:00','Roma','Circolo B',0);
insert into public.site_metrics (id, site_id, label, value, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','Follower','1',0);
insert into public.site_contacts (id, site_id, role, name, email, consent_confirmed_at, consent_confirmed_by, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555','booking','Booker Draft','draft@ownerb\.test',now(),'44444444-4444-4444-4444-444444444444',0);
insert into public.site_tracks (id, site_id, title, source, storage_path, mime_type, byte_size, sort_order) values
  ('0d0d0d0d-0000-0000-0000-000000000007','55555555-5555-5555-5555-555555555555','Traccia draft','upload','test/b-track.mp3','audio/mpeg',3072,0);

-- ---------------------------------------------------------------------------
-- 1. Enumerazione delle colonne: l'insieme esposto è esattamente l'allowlist.
-- ---------------------------------------------------------------------------
select columns_are('public','public_sites', array['id','slug','config','hero_asset_id'],
  'public_sites espone esattamente id, slug, config, hero_asset_id');
select columns_are('public','public_tracks', array['id','site_id','title','source','duration_seconds','embed_provider','embed_url','sort_order'],
  'public_tracks espone esattamente id, site_id, title, source, duration_seconds, embed_provider, embed_url, sort_order');
select columns_are('public','public_assets', array['id','site_id','kind','sort_order'],
  'public_assets espone esattamente id, site_id, kind, sort_order');
select columns_are('public','public_posts', array['id','site_id','kind','caption','sort_order','visual_asset_id','cover_asset_id','track_id'],
  'public_posts espone esattamente id, site_id, kind, caption, sort_order e i tre riferimenti');
select columns_are('public','public_links', array['id','site_id','provider','url','sort_order'],
  'public_links espone esattamente id, site_id, provider, url, sort_order');
select columns_are('public','public_press', array['id','site_id','publication','quote','published_on','url','sort_order'],
  'public_press espone esattamente id, site_id, publication, quote, published_on, url, sort_order');
select columns_are('public','public_dates', array['id','site_id','starts_at','city','venue','ticket_url','sort_order'],
  'public_dates espone esattamente id, site_id, starts_at, city, venue, ticket_url, sort_order');
select columns_are('public','public_metrics', array['id','site_id','label','value','sort_order'],
  'public_metrics espone esattamente id, site_id, label, value, sort_order');
select columns_are('public','public_contacts', array['id','site_id','role','name','email','sort_order'],
  'public_contacts espone esattamente id, site_id, role, name, email, sort_order');
select columns_are('public','public_site_meta', array['id','slug','updated_at'],
  'public_site_meta espone esattamente id, slug, updated_at');

select set_eq(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and c.relname like 'public\_%'$$,
  array['public_sites','public_tracks','public_assets','public_posts','public_links','public_press',
        'public_dates','public_metrics','public_contacts','public_site_meta'],
  'l''insieme delle viste pubbliche è esattamente quello dichiarato: una vista nuova senza allowlist rompe questo test'
);
select ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' and c.relname like 'public\_%'
    and not coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']),
  'ogni vista pubblica è security_invoker: nessuna proiezione gira con i diritti del proprietario');
select ok(not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name like 'public\_%'
    and column_name in ('storage_path','byte_size','mime_type','owner_id','purged_at',
                        'consent_confirmed_at','consent_confirmed_by','publication_status','moderation_reason')),
  'nessuna vista pubblica espone path, byte, MIME, owner, purga, consenso o stato di moderazione');

-- ---------------------------------------------------------------------------
-- 2. Privilegi: anon non riceve SELECT di tabella né colonne interne (§6).
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon','public.site_assets','select'), 'anon non ha SELECT di tabella su site_assets');
select ok(not has_table_privilege('anon','public.site_tracks','select'), 'anon non ha SELECT di tabella su site_tracks');
select ok(not has_table_privilege('anon','public.site_posts','select'), 'anon non ha SELECT di tabella su site_posts');
select ok(not has_table_privilege('anon','public.site_links','select'), 'anon non ha SELECT di tabella su site_links');
select ok(not has_table_privilege('anon','public.site_press','select'), 'anon non ha SELECT di tabella su site_press');
select ok(not has_table_privilege('anon','public.site_dates','select'), 'anon non ha SELECT di tabella su site_dates');
select ok(not has_table_privilege('anon','public.site_metrics','select'), 'anon non ha SELECT di tabella su site_metrics');
select ok(not has_table_privilege('anon','public.site_contacts','select'), 'anon non ha SELECT di tabella su site_contacts');
select ok(not has_column_privilege('anon','public.site_assets','storage_path','select'), 'anon non legge site_assets.storage_path');
select ok(not has_column_privilege('anon','public.site_assets','byte_size','select'), 'anon non legge site_assets.byte_size');
select ok(not has_column_privilege('anon','public.site_assets','mime_type','select'), 'anon non legge site_assets.mime_type');
select ok(not has_column_privilege('anon','public.site_tracks','storage_path','select'), 'anon non legge site_tracks.storage_path');
select ok(not has_column_privilege('anon','public.site_contacts','consent_confirmed_at','select'), 'anon non legge site_contacts.consent_confirmed_at');
select ok(not has_column_privilege('anon','public.site_contacts','consent_confirmed_by','select'), 'anon non legge site_contacts.consent_confirmed_by');
select ok(not has_column_privilege('anon','public.sites','owner_id','select'), 'anon non legge sites.owner_id');
select ok(has_table_privilege('anon','public.public_contacts','select'), 'anon legge la proiezione public_contacts');

-- Enumerazione anche dei grant, non solo delle colonne esposte. Una vista
-- `security_invoker` è leggibile solo se `anon` ha i privilegi sulle colonne
-- sottostanti che la vista tocca: i due insiemi devono restare allineati. Un grant
-- in più allarga la superficie in silenzio; un grant in meno fa nascere morta la
-- proiezione, che è esattamente com'era nata `public_tracks` in PR-0.
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_assets' and privilege_type='SELECT'$$,
  array['id','site_id','kind','sort_order','purged_at'],
  'anon: grant di colonna su site_assets esattamente id, site_id, kind, sort_order, purged_at');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_tracks' and privilege_type='SELECT'$$,
  array['id','site_id','title','source','duration_seconds','embed_provider','embed_url','sort_order','purged_at'],
  'anon: grant di colonna su site_tracks esattamente le colonne che public_tracks tocca');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_posts' and privilege_type='SELECT'$$,
  array['id','site_id','kind','caption','sort_order','visual_asset_id','cover_asset_id','track_id'],
  'anon: grant di colonna su site_posts esattamente le colonne che public_posts tocca');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_links' and privilege_type='SELECT'$$,
  array['id','site_id','provider','url','sort_order'],
  'anon: grant di colonna su site_links esattamente id, site_id, provider, url, sort_order');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_press' and privilege_type='SELECT'$$,
  array['id','site_id','publication','quote','published_on','url','sort_order'],
  'anon: grant di colonna su site_press esattamente le colonne pubbliche');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_dates' and privilege_type='SELECT'$$,
  array['id','site_id','starts_at','city','venue','ticket_url','sort_order'],
  'anon: grant di colonna su site_dates esattamente le colonne pubbliche');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_metrics' and privilege_type='SELECT'$$,
  array['id','site_id','label','value','sort_order'],
  'anon: grant di colonna su site_metrics esattamente id, site_id, label, value, sort_order');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_contacts' and privilege_type='SELECT'$$,
  array['id','site_id','role','name','email','sort_order'],
  'anon: grant di colonna su site_contacts senza le due colonne del consenso');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='sites' and privilege_type='SELECT'$$,
  array['id','slug','publication_status','updated_at'],
  'anon: grant di colonna su sites esattamente id, slug, publication_status, updated_at');
select set_eq($$select column_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and table_name='site_config' and privilege_type='SELECT'$$,
  array['site_id','config','hero_asset_id','updated_at'],
  'anon: grant di colonna su site_config esattamente site_id, config, hero_asset_id, updated_at');
select set_eq($$select distinct table_name::text from information_schema.column_privileges
  where grantee='anon' and table_schema='public' and privilege_type='SELECT'$$,
  array['plans','sites','site_config','site_assets','site_tracks','site_posts','site_links','site_press',
        'site_dates','site_metrics','site_contacts','public_sites','public_tracks','public_assets','public_posts',
        'public_links','public_press','public_dates','public_metrics','public_contacts','public_site_meta'],
  'la superficie di lettura di anon in public è esattamente quella dichiarata: nessuna relazione ci entra in silenzio');

-- ---------------------------------------------------------------------------
-- 3. anon: la tabella base è negata, la proiezione no.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.site_assets$$, '42501', null, 'anon su site_assets: SQLSTATE 42501');
select throws_ok($$select storage_path from public.site_assets$$, '42501', null, 'anon su site_assets.storage_path: SQLSTATE 42501');
select throws_ok($$select * from public.site_tracks$$, '42501', null, 'anon su site_tracks: SQLSTATE 42501');
select throws_ok($$select storage_path from public.site_tracks$$, '42501', null, 'anon su site_tracks.storage_path: SQLSTATE 42501');
select throws_ok($$select * from public.site_contacts$$, '42501', null, 'anon su site_contacts: SQLSTATE 42501');
select throws_ok($$select consent_confirmed_at from public.site_contacts$$, '42501', null, 'anon su site_contacts.consent_confirmed_at: SQLSTATE 42501');
select throws_ok($$select * from public.site_posts$$, '42501', null, 'anon su site_posts: SQLSTATE 42501');
select throws_ok($$select * from public.site_press$$, '42501', null, 'anon su site_press: SQLSTATE 42501');
select throws_ok($$select private.contact_is_public('02020202-0000-0000-0000-000000000001')$$, '42501', null,
  'anon non invoca il predicato di consenso: nessun oracolo RPC, SQLSTATE 42501');
select results_eq($$select count(*)::integer from public.site_assets where purged_at is not null$$, array[0],
  'anon vede la colonna purged_at solo per valutarla, e per lui è sempre NULL');

-- ---------------------------------------------------------------------------
-- 4. anon: contenuto proiettato, casi positivi e negativi puntuali.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select id::text from public.public_assets order by sort_order$$,
  array['33333333-3333-3333-3333-333333333333','a1a1a1a1-0000-0000-0000-000000000001'],
  'public_assets: solo i due asset non purgati del sito pubblicato');
select results_eq(
  $$select id::text from public.public_assets where id='a1a1a1a1-0000-0000-0000-000000000002'$$,
  array[]::text[], 'public_assets: l''asset purgato a1a1…0002 non c''è');
select results_eq(
  $$select id::text from public.public_assets where id='66666666-6666-6666-6666-666666666666'$$,
  array[]::text[], 'public_assets: l''asset 6666… del sito draft non c''è');

select results_eq(
  $$select id::text from public.public_posts order by sort_order$$,
  array['c1c1c1c1-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000003','c1c1c1c1-0000-0000-0000-000000000005'],
  'public_posts: restano i tre post il cui media esiste ancora');
select results_eq(
  $$select id::text from public.public_posts where id='c1c1c1c1-0000-0000-0000-000000000002'$$,
  array[]::text[], 'public_posts: il post c1c1…0002 con visual purgato non c''è');
select results_eq(
  $$select id::text from public.public_posts where id='c1c1c1c1-0000-0000-0000-000000000004'$$,
  array[]::text[], 'public_posts: il post c1c1…0004 con traccia purgata non c''è');
select results_eq(
  $$select id::text from public.public_posts where id='0d0d0d0d-0000-0000-0000-000000000001'$$,
  array[]::text[], 'public_posts: il post 0d0d…0001 del sito draft non c''è');
select results_eq(
  $$select cover_asset_id::text from public.public_posts where id='c1c1c1c1-0000-0000-0000-000000000003'$$,
  array['a1a1a1a1-0000-0000-0000-000000000001'], 'public_posts: la cover valida è esposta come identificativo');
select is(
  (select cover_asset_id from public.public_posts where id='c1c1c1c1-0000-0000-0000-000000000005'),
  null::uuid, 'public_posts: la cover purgata diventa NULL, il post resta');
select results_eq(
  $$select visual_asset_id::text from public.public_posts where id='c1c1c1c1-0000-0000-0000-000000000001'$$,
  array['a1a1a1a1-0000-0000-0000-000000000001'], 'public_posts: il post visual espone l''id dell''asset, non il path');

select results_eq(
  $$select id::text from public.public_tracks order by sort_order$$,
  array['b1b1b1b1-0000-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000003'],
  'public_tracks: anon la legge davvero, e la traccia purgata non c''è');
select results_eq(
  $$select id::text from public.public_tracks where id='0d0d0d0d-0000-0000-0000-000000000007'$$,
  array[]::text[], 'public_tracks: la traccia 0d0d…0007 del sito draft non c''è');

select results_eq($$select id::text from public.public_links$$, array['d1d1d1d1-0000-0000-0000-000000000001'],
  'public_links: solo il link del sito pubblicato');
select results_eq($$select id::text from public.public_links where id='0d0d0d0d-0000-0000-0000-000000000002'$$,
  array[]::text[], 'public_links: il link 0d0d…0002 del sito draft non c''è');
select results_eq($$select id::text from public.public_press$$, array['e1e1e1e1-0000-0000-0000-000000000001'],
  'public_press: solo la quote del sito pubblicato');
select results_eq($$select id::text from public.public_press where id='0d0d0d0d-0000-0000-0000-000000000003'$$,
  array[]::text[], 'public_press: la quote 0d0d…0003 del sito draft non c''è');
select results_eq($$select id::text from public.public_dates$$, array['f1f1f1f1-0000-0000-0000-000000000001'],
  'public_dates: solo la data del sito pubblicato');
select results_eq($$select id::text from public.public_dates where id='0d0d0d0d-0000-0000-0000-000000000004'$$,
  array[]::text[], 'public_dates: la data 0d0d…0004 del sito draft non c''è');
select results_eq($$select id::text from public.public_metrics$$, array['01010101-0000-0000-0000-000000000001'],
  'public_metrics: solo il numero del sito pubblicato');
select results_eq($$select id::text from public.public_metrics where id='0d0d0d0d-0000-0000-0000-000000000005'$$,
  array[]::text[], 'public_metrics: il numero 0d0d…0005 del sito draft non c''è');

-- Consenso: il filtro, non il nascondimento.
select results_eq($$select id::text from public.public_contacts$$, array['02020202-0000-0000-0000-000000000001'],
  'public_contacts: solo il contatto con consenso confermato');
select results_eq($$select id::text from public.public_contacts where id='02020202-0000-0000-0000-000000000002'$$,
  array[]::text[], 'public_contacts: il contatto 0202…0002 senza consenso non c''è, email compresa');
select results_eq($$select count(*)::integer from public.public_contacts where email like '%press%'$$, array[0],
  'public_contacts: nessuna email del contatto non consenziente trapela');
select results_eq($$select id::text from public.public_contacts where id='0d0d0d0d-0000-0000-0000-000000000006'$$,
  array[]::text[], 'public_contacts: il contatto 0d0d…0006, consenziente ma su sito draft, non c''è');

-- Sitemap.
select results_eq($$select slug from public.public_site_meta$$, array['nvll-click'],
  'public_site_meta: solo il sito pubblicato');
select ok((select updated_at is not null from public.public_site_meta where slug='nvll-click'),
  'public_site_meta: lastModified disponibile per la sitemap');

-- ---------------------------------------------------------------------------
-- 5. Media: da anon si arriva all'identificativo, mai al path (requisito 2).
-- ---------------------------------------------------------------------------
select results_eq(
  $$select a.kind::text from public.public_sites s join public.public_assets a on a.id = s.hero_asset_id
    where s.slug='nvll-click'$$,
  array['visual'], 'hero: da public_sites.hero_asset_id si risolve una riga di public_assets');
select results_eq(
  $$select source::text from public.public_tracks where id='b1b1b1b1-0000-0000-0000-000000000001'$$,
  array['upload'], 'upload: la proiezione dichiara source=upload, la route firma l''URL partendo dall''id');
select results_eq(
  $$select embed_url from public.public_tracks where id='b1b1b1b1-0000-0000-0000-000000000003'$$,
  array['https://open\.spotify\.com/track/fixture'], 'embed: l''URL provider resta pubblico, è già esterno');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Il filtro vive nella vista, non solo nella policy RLS.
-- Un visitatore autenticato che legge la proiezione del proprio sito vede il
-- pubblico, non il privato: altrimenti basterebbe fare login per leggere un
-- contatto senza consenso o un file purgato.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq($$select id::text from public.public_contacts$$, array['02020202-0000-0000-0000-000000000001'],
  'owner A autenticato: public_contacts nasconde il proprio contatto senza consenso');
select results_eq($$select count(*)::integer from public.site_contacts where consent_confirmed_at is null$$, array[1],
  'owner A autenticato: la riga senza consenso esiste e lui la vede sulla tabella base, non nella proiezione');
select results_eq($$select id::text from public.public_assets where id='a1a1a1a1-0000-0000-0000-000000000002'$$,
  array[]::text[], 'owner A autenticato: il proprio asset purgato a1a1…0002 non entra nella proiezione');
select results_eq($$select id::text from public.public_posts order by sort_order$$,
  array['c1c1c1c1-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000003','c1c1c1c1-0000-0000-0000-000000000005'],
  'owner A autenticato: stessa proiezione FEED di anon');
select results_eq($$select id::text from public.public_tracks where id='b1b1b1b1-0000-0000-0000-000000000002'$$,
  array[]::text[], 'owner A autenticato: la propria traccia purgata b1b1…0002 non entra nella proiezione');

-- Owner B è autenticato e proprietario di un draft: la RLS gli mostra tutte le sue
-- righe, quindi qui a filtrare resta soltanto la WHERE della vista. È il testimone
-- indipendente del filtro `published` di ogni proiezione.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select results_eq($$select id::text from public.public_assets where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: il proprio sito draft non ha asset pubblici');
select results_eq($$select id::text from public.public_contacts where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: il contatto consenziente del proprio draft resta non pubblico');
select results_eq($$select id::text from public.public_posts where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessun post del proprio draft è pubblico');
select results_eq($$select id::text from public.public_links where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessun link del proprio draft è pubblico');
select results_eq($$select id::text from public.public_press where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessuna quote del proprio draft è pubblica');
select results_eq($$select id::text from public.public_dates where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessuna data del proprio draft è pubblica');
select results_eq($$select id::text from public.public_metrics where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessun numero del proprio draft è pubblico');
select results_eq($$select id::text from public.public_tracks where site_id='55555555-5555-5555-5555-555555555555'$$,
  array[]::text[], 'owner B autenticato: nessuna traccia del proprio draft è pubblica');
select results_eq($$select slug from public.public_site_meta where slug='owner-b-draft'$$,
  array[]::text[], 'owner B autenticato: il proprio draft non entra nella sitemap');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Nessuna regressione strutturale introdotta dalle proiezioni.
-- ---------------------------------------------------------------------------
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity)),
  'le proiezioni non hanno introdotto tabelle senza RLS e FORCE RLS');
select ok(has_function_privilege('anon','private.contact_is_public(uuid)','execute'),
  'anon ha EXECUTE sul predicato di consenso: serve alla WHERE della vista');
select ok(not has_schema_privilege('anon','private','usage'),
  'anon non ha USAGE su schema private: il predicato è usabile solo attraverso la vista');
select is((select count(*)::integer from pg_policy p
  join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and p.polcmd <> 'r'
    and exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname='anon')), 0,
  'ad anon non è concessa alcuna policy diversa da SELECT');

select * from finish();
rollback;
