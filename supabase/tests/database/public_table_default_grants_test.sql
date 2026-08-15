-- Banco per i privilegi di tabella ereditati dal bootstrap Supabase.
--
-- IL DIFETTO CHE MISURA
-- I default privileges di `postgres` nello schema `public`, presenti sui progetti
-- cloud non recenti, danno ai tre ruoli della Data API tutti i privilegi su ogni
-- relazione che nasce in `public`. PR-0 li revoca alla riga 265, ma quella riga
-- vale una volta sola: `billing_events` e le otto proiezioni pubbliche sono nate
-- dopo, e li hanno ereditati di nuovo. Sul progetto reale `anon` aveva
-- `arwdDxtm` su `billing_events`.
--
-- QUESTO E' UN BANCO CHE IN CI NON PUO' VEDERE IL PROPRIO DIFETTO
-- E' la differenza piu' importante da tenere a mente leggendolo. Lo stack locale
-- della CLI non ha quei default privileges (`auto_expose_new_tables` non e'
-- impostato), quindi in CI le nove relazioni nascono gia' pulite e le asserzioni
-- sull'ACL sarebbero verdi anche senza la migrazione. Il difetto e' visibile solo
-- ricostruendo lo schema con i default privileges del cloud. Ne segue una scelta
-- di progetto del banco: le asserzioni sono divise in due famiglie con lavori
-- diversi.
--   * Le asserzioni di FORMA (sezioni 1, 2, 3) dicono qual e' l'ACL giusta. In
--     produzione sono l'unica cosa che tiene; in CI sono una tautologia utile,
--     perche' documentano l'ACL attesa e falliscono se qualcuno la allarga a mano.
--   * L'asserzione di INVENTARIO (sezione 4) e' quella che lavora in CI: elenca
--     le relazioni di `public`. Una tabella creata domani, che in produzione
--     erediterebbe il default e in CI no, fa diventare rossa la CI comunque --
--     non perche' i suoi privilegi siano sbagliati li', ma perche' e' comparsa
--     senza che nessuno ne abbia dichiarati i privilegi. E' il solo modo per
--     intercettare in CI un difetto che in CI non esiste.
--
-- PERCHE' L'ACL NON VIENE MAI ASSERITA COME STRINGA
-- `relacl` si legge `arwdDxtm` su PostgreSQL 17 e `arwdDxt` su 16: MAINTAIN e'
-- comparso in 17. Il repository dichiara `major_version = 17`, ma un banco che
-- confronta la stringa dell'ACL si rompe al primo ambiente con un major diverso e
-- non misura nulla di piu'. Qui si asserisce sempre l'insieme dei privilegi per
-- ruolo, mai la sua rappresentazione.

begin;
select plan(23);

-- ---------------------------------------------------------------------------
-- 1. billing_events: l'ACL attesa, per tutti e quattro i ruoli.
--    Non solo l'assenza di cio' che non vogliamo: l'insieme esatto.
-- ---------------------------------------------------------------------------

-- I tre ruoli della Data API piu' PUBLIC, in una sola asserzione esaustiva.
-- `anon` e PUBLIC non compaiono nell'atteso: la loro riga vuota e' l'asserzione.
select set_eq(
  $$select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ' -> ' || a.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public' and c.relname = 'billing_events'
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
           in ('PUBLIC', 'anon', 'authenticated', 'service_role')$$,
  array['authenticated -> SELECT', 'service_role -> SELECT', 'service_role -> INSERT'],
  'billing_events: authenticated legge, service_role legge e inserisce, anon e PUBLIC niente'
);

-- Il quarto ruolo: il proprietario non deve aver perso nulla nella revoca.
-- MAINTAIN non e' nell'elenco perche' non esiste prima di PostgreSQL 17.
select is_empty(
  $$select p from unnest(array['INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     where not has_table_privilege('postgres', 'public.billing_events', p)$$,
  'billing_events: postgres conserva ogni privilegio, la revoca non ha toccato il proprietario'
);

-- TRUNCATE ha una riga sua perche' e' l'unico privilegio dell'elenco ereditato che
-- nessuna policy RLS intercetta: prima della migrazione `anon` svuotava davvero il
-- registro, pur non potendo leggerne una riga.
select ok(not has_table_privilege('anon', 'public.billing_events', 'truncate'),
  'anon non ha TRUNCATE su billing_events: e'' il privilegio che la RLS non copre');
select ok(not has_table_privilege('authenticated', 'public.billing_events', 'truncate'),
  'authenticated non ha TRUNCATE su billing_events');
select ok(not has_table_privilege('service_role', 'public.billing_events', 'truncate'),
  'service_role non ha TRUNCATE su billing_events');

-- Append-only per privilegio, che e' cio' che la migrazione B dichiarava e che
-- sul database reale non era vero.
select ok(not has_table_privilege('service_role', 'public.billing_events', 'update'),
  'service_role non ha UPDATE su billing_events: append-only per privilegio');
select ok(not has_table_privilege('service_role', 'public.billing_events', 'delete'),
  'service_role non ha DELETE su billing_events');
select ok(has_table_privilege('service_role', 'public.billing_events', 'insert'),
  'service_role conserva INSERT: il registro deve poter crescere');
select ok(has_table_privilege('authenticated', 'public.billing_events', 'select'),
  'authenticated conserva SELECT: la policy di lettura del platform admin ne ha bisogno');

-- ---------------------------------------------------------------------------
-- 2. Le otto proiezioni nate dopo la revoca di PR-0: sola lettura.
-- ---------------------------------------------------------------------------
select set_eq(
  $$select c.relname::text || ':' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and c.relname in ('public_assets','public_posts','public_links','public_press',
                         'public_dates','public_metrics','public_contacts','public_site_meta')
       and a.privilege_type = 'SELECT'
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
           in ('PUBLIC', 'anon', 'authenticated', 'service_role')$$,
  array[
    'public_assets:anon','public_assets:authenticated','public_assets:service_role',
    'public_posts:anon','public_posts:authenticated','public_posts:service_role',
    'public_links:anon','public_links:authenticated','public_links:service_role',
    'public_press:anon','public_press:authenticated','public_press:service_role',
    'public_dates:anon','public_dates:authenticated','public_dates:service_role',
    'public_metrics:anon','public_metrics:authenticated','public_metrics:service_role',
    'public_contacts:anon','public_contacts:authenticated','public_contacts:service_role',
    'public_site_meta:anon','public_site_meta:authenticated','public_site_meta:service_role'],
  'le otto proiezioni concedono SELECT ai tre ruoli della Data API, come dichiarato'
);

select is_empty(
  $$select c.relname::text || ' -> ' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
      || ' -> ' || a.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and c.relname in ('public_assets','public_posts','public_links','public_press',
                         'public_dates','public_metrics','public_contacts','public_site_meta')
       and a.privilege_type <> 'SELECT'
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
           in ('PUBLIC', 'anon', 'authenticated', 'service_role')$$,
  'sulle otto proiezioni nessun ruolo della Data API ha un privilegio diverso da SELECT'
);

-- ---------------------------------------------------------------------------
-- 3. Esaustivo su tutto lo schema `public`. Non "le nove che conosco sono a
--    posto?" ma "esiste una relazione che concede a un ruolo del client un
--    privilegio che nessuno ha scritto?".
-- ---------------------------------------------------------------------------

-- `anon` e PUBLIC non scrivono e non alterano la struttura di nulla, mai.
-- TRUNCATE, REFERENCES e TRIGGER non servono a un ruolo della Data API in nessuno
-- scenario: se compaiono, sono arrivati da soli.
select is_empty(
  $$select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') || ' -> ' || c.relname || ' -> ' || a.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') in ('anon', 'PUBLIC')
       and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')$$,
  'nessuna relazione di public concede ad anon o a PUBLIC un privilegio di scrittura o di struttura'
);

-- `authenticated` scrive otto tabelle di contenuto, e va bene: quelli sono grant
-- scritti in PR-0 riga 273. TRUNCATE, REFERENCES e TRIGGER non lo sono mai.
select is_empty(
  $$select c.relname::text || ' -> ' || a.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') = 'authenticated'
       and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')$$,
  'authenticated non ha TRUNCATE, REFERENCES o TRIGGER su alcuna relazione di public'
);

-- La superficie di lettura di `anon` a livello di relazione. I grant di colonna
-- sono un'altra cosa e li copre gia' public_projections_test; qui si guarda
-- `relacl`, che e' dove il difetto viveva.
select set_eq(
  $$select c.relname::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') = 'anon'
       and a.privilege_type = 'SELECT'$$,
  array['plans','public_sites','public_tracks','public_assets','public_posts','public_links',
        'public_press','public_dates','public_metrics','public_contacts','public_site_meta'],
  'anon legge, a livello di relazione, i piani e le dieci proiezioni: nient''altro'
);

-- ---------------------------------------------------------------------------
-- 4. L'inventario. E' l'asserzione che lavora in CI, dove il difetto non esiste:
--    una relazione nuova non puo' entrare in `public` senza che qualcuno passi
--    di qui e dichiari i suoi privilegi.
-- ---------------------------------------------------------------------------
select set_eq(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')$$,
  array['billing_events','moderation_events','plans','platform_admins','profiles',
        'public_assets','public_contacts','public_dates','public_links','public_metrics',
        'public_posts','public_press','public_site_meta','public_sites','public_tracks',
        'site_assets','site_config','site_contacts','site_dates','site_links','site_metrics',
        'site_posts','site_press','site_preview_links','site_slug_redirects','site_subscriptions',
        'site_tracks','site_upload_reservations','site_usage','sites'],
  'l''inventario delle relazioni di public e'' quello dichiarato: niente entra in silenzio'
);

-- ---------------------------------------------------------------------------
-- 5. Comportamento, non solo catalogo. Un'ACL si legge, un privilegio si esercita:
--    queste righe fanno la seconda cosa.
-- ---------------------------------------------------------------------------
set local role anon;

-- La riga che prima passava. Il TRUNCATE riusciva pur con RLS e FORCE RLS attive,
-- perche' TRUNCATE non e' soggetto a RLS, e portava via con l'audit anche la
-- chiave di idempotenza degli eventi Stripe.
select throws_ok(
  $$truncate public.billing_events$$,
  '42501',
  'permission denied for table billing_events',
  'anon non svuota il registro billing: lo ferma il privilegio, l''unica difesa che TRUNCATE conosca'
);

-- Prima la RLS rifiutava questa insert con `new row violates row-level security
-- policy`; ora non si arriva alla policy. Il messaggio atteso dice quale delle due
-- difese ha risposto.
select throws_ok(
  $$insert into public.billing_events(stripe_event_id,site_id,rule,billing_status,plan_code,billing_interval,from_status,to_status)
    values ('evt_anon','22222222-2222-2222-2222-222222222222','falso','active','base','month','draft','published')$$,
  '42501',
  'permission denied for table billing_events',
  'anon non scrive il registro billing: ora lo ferma il privilegio, non piu'' la policy'
);

-- Controllo: la lettura pubblica non e' stata toccata dalla revoca.
select lives_ok(
  $$select count(*) from public.public_links$$,
  'controllo: anon continua a leggere la proiezione public_links'
);

reset role;

set local role service_role;

select lives_ok(
  $$insert into public.billing_events(stripe_event_id,site_id,rule,billing_status,plan_code,billing_interval,from_status,to_status)
    values ('evt_backend','22222222-2222-2222-2222-222222222222','fixture','active','base','month','draft','published')$$,
  'service_role scrive il registro billing: l''append-only resta append'
);

select throws_ok(
  $$update public.billing_events set rule='manomesso' where stripe_event_id='evt_backend'$$,
  '42501',
  'permission denied for table billing_events',
  'service_role non riscrive la storia: append-only per privilegio, non per promessa'
);

select throws_ok(
  $$delete from public.billing_events where stripe_event_id='evt_backend'$$,
  '42501',
  'permission denied for table billing_events',
  'service_role non cancella un evento gia'' applicato'
);

select throws_ok(
  $$truncate public.billing_events$$,
  '42501',
  'permission denied for table billing_events',
  'nemmeno service_role svuota il registro'
);

reset role;

-- Il platform admin continua a leggere l'audit: e' la sola policy che
-- billing_events dichiara, e senza SELECT di tabella non varrebbe nulla.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select lives_ok(
  $$select count(*) from public.billing_events$$,
  'il platform admin continua a leggere il registro billing'
);
reset role;

select * from finish();
rollback;
