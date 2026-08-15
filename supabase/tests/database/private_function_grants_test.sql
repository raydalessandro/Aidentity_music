-- I ruoli reali scrivono contenuto? Nessun banco lo chiedeva.
--
-- Ogni test pgTAP esistente che inserisce contenuto lo fa con il ruolo che applica
-- le migrazioni, cioe' il proprietario delle funzioni `private`. Quel ruolo puo'
-- tutto per costruzione: e' l'unico che il contratto non descrive. I ruoli che il
-- prodotto usa davvero sono due, `authenticated` per l'owner del sito e
-- `service_role` per backend e webhook, e nessuno dei due era mai stato messo alla
-- prova su una scrittura.
--
-- Qui la scrittura passa dai ruoli reali. Il punto non e' la RLS — quella e' gia'
-- coperta — ma i CHECK: `site_tracks`, `site_links`, `site_press`, `site_dates` e
-- `site_config` valutano funzioni di `private`, e un CHECK e' valutato con i
-- privilegi di chi scrive, non di chi ha creato la tabella.
--
-- Il banco copre le tre direzioni, e la terza vale quanto le prime due:
--   1. cosa DEVE riuscire, per ogni ruolo che il contratto autorizza a scrivere;
--   2. cosa DEVE essere rifiutato, con SQLSTATE e vincolo dichiarati, perche' un
--      permesso concesso non deve trasformare un rifiuto in un'ammissione;
--   3. cosa DEVE restare chiuso: l'inventario esatto delle funzioni `private`
--      eseguibili dai tre ruoli della Data API. Se un domani qualcuno concede un
--      EXECUTE in piu' per far passare una scrittura, e' questo elenco a diventare
--      rosso.

begin;
select plan(34);

-- ---------------------------------------------------------------------------
-- 1. service_role: il ruolo di backend e webhook.
--    L0.7 §5 affida a lui le tracce, che l'owner non puo' scrivere direttamente.
-- ---------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Backend embed','embed','spotify','https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  'service_role inserisce una traccia embed valida'
);

-- Il ramo `upload` del CHECK non nomina alcuna funzione, ma il CHECK e' una sola
-- espressione: il privilegio su `valid_embed_url` e' verificato quando
-- l'espressione viene inizializzata, prima che una riga venga valutata. Se manca,
-- cade anche l'insert che quella funzione non la userebbe mai.
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,storage_path,mime_type,byte_size,duration_seconds)
    values ('22222222-2222-2222-2222-222222222222','Backend upload','upload','backend/track.mp3','audio/mpeg',2048,180)$$,
  'service_role inserisce una traccia upload'
);

-- Controllo: il CHECK di site_assets non nomina funzioni private. Se questo test
-- fosse rosso il problema non sarebbe nei privilegi delle funzioni.
select lives_ok(
  $$insert into public.site_assets(site_id,kind,storage_path,mime_type,byte_size)
    values ('22222222-2222-2222-2222-222222222222','photo_hi','backend/photo.jpg','image/jpeg',4096)$$,
  'controllo: service_role inserisce un asset, CHECK senza funzioni private'
);

select lives_ok(
  $$insert into public.site_links(site_id,provider,url)
    values ('22222222-2222-2222-2222-222222222222','instagram','https://instagram.com/nvllclick')$$,
  'service_role inserisce un link'
);

select lives_ok(
  $$update public.site_config set config = config || '{"grain":true}'::jsonb
    where site_id='22222222-2222-2222-2222-222222222222'$$,
  'service_role aggiorna la configurazione di un sito'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. authenticated, impersonando l'owner del sito del seed.
--    Sono le cinque scritture che L0.7 §6.4 gli riconosce e che PR-0 gli concede
--    a livello di tabella.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.site_links(site_id,provider,url)
    values ('22222222-2222-2222-2222-222222222222','spotify','https://open.spotify.com/artist/1Xyo4u8uXC1ZmMpatF05PJ')$$,
  'owner inserisce un link sul proprio sito'
);

select lives_ok(
  $$insert into public.site_dates(site_id,starts_at,city,venue,ticket_url)
    values ('22222222-2222-2222-2222-222222222222','2026-11-14T21:00:00+01:00','Milano','Circolo Magnolia','https://dice.fm/event/demo')$$,
  'owner inserisce una data con link biglietti'
);

select lives_ok(
  $$insert into public.site_press(site_id,publication,quote,url)
    values ('22222222-2222-2222-2222-222222222222','Rumore','Un disco che non chiede permesso','https://rumoremag.example/recensione')$$,
  'owner inserisce una citazione stampa con URL'
);

select lives_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','booking','Booking','booking@example.com')$$,
  'owner inserisce un contatto con email ordinaria'
);

select lives_ok(
  $$update public.site_config set config = config || '{"iconFamily":"stencil"}'::jsonb
    where site_id='22222222-2222-2222-2222-222222222222'$$,
  'owner aggiorna la configurazione del proprio sito'
);

-- Controllo simmetrico a quello di service_role: nessuna funzione privata nel CHECK.
select lives_ok(
  $$insert into public.site_metrics(site_id,label,value)
    values ('22222222-2222-2222-2222-222222222222','Ascolti mensili','128.000')$$,
  'controllo: owner inserisce una metrica, CHECK senza funzioni private'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. Cosa deve essere rifiutato. Un privilegio concesso non deve ammettere nulla
--    che prima era respinto: ogni riga qui dichiara SQLSTATE e, dove il vincolo
--    ha un nome, anche il vincolo. SQLSTATE 42501 arriva sia da un privilegio di
--    tabella mancante sia da una policy RLS violata: dove le due cause sono
--    distinguibili il messaggio atteso e' scritto, altrimenti il test non
--    saprebbe dire perche' ha vinto.
-- ---------------------------------------------------------------------------
set local role service_role;

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Host camuffato','embed','spotify','https://open.spotify.com.evil.test/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '23514',
  'new row for relation "site_tracks" violates check constraint "site_tracks_check"',
  'service_role: host fuori allowlist rifiutato da site_tracks_check, SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_links(site_id,provider,url)
    values ('22222222-2222-2222-2222-222222222222','tiktok','http://tiktok.com/@nvllclick')$$,
  '23514',
  'new row for relation "site_links" violates check constraint "site_links_url_check"',
  'service_role: link non HTTPS rifiutato da site_links_url_check, SQLSTATE 23514'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','press','Press','pressexample.com')$$,
  '23514',
  'new row for relation "site_contacts" violates check constraint "site_contacts_email_check"',
  'owner: email malformata rifiutata da site_contacts_email_check, SQLSTATE 23514'
);

-- Isolamento fra tenant: il sito 5555 e' dell'owner B.
select throws_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('55555555-5555-5555-5555-555555555555','booking','Intruso','intruso@example.com')$$,
  '42501',
  'new row violates row-level security policy for table "site_contacts"',
  'owner A non scrive un contatto di B: a rifiutare e'' la RLS, SQLSTATE 42501'
);

select throws_ok(
  $$insert into public.site_links(site_id,provider,url)
    values ('55555555-5555-5555-5555-555555555555','spotify','https://open.spotify.com/artist/1Xyo4u8uXC1ZmMpatF05PJ')$$,
  '42501',
  'new row violates row-level security policy for table "site_links"',
  'owner A non scrive un link di B: a rifiutare e'' la RLS, non un privilegio mancante'
);

-- Le tracce restano fuori dalla portata del client: PR-0 non concede a
-- `authenticated` alcun privilegio di scrittura su site_tracks, e concedere
-- EXECUTE su un validatore non gliene concede uno. Il messaggio atteso dice che a
-- fermarlo e' il privilegio di tabella, non la funzione.
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Client embed','embed','spotify','https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '42501',
  'permission denied for table site_tracks',
  'il client non scrive tracce: lo ferma il privilegio di tabella, SQLSTATE 42501'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. Niente di piu' aperto. Esaustivo, non a campione: la domanda non e' "le
--    funzioni che mi vengono in mente sono chiuse?" ma "esiste una sola coppia
--    (ruolo, funzione) eseguibile che non sia dichiarata qui sotto?".
--    L'elenco e' la lista dei permessi ammessi, con la ragione di ciascuno. Che
--    i permessi ci siano davvero lo dimostrano le scritture delle sezioni 1 e 2,
--    che e' una prova migliore di un privilegio letto dal catalogo; qui si
--    dimostra il divieto, che le scritture non possono dimostrare.
-- ---------------------------------------------------------------------------
select is_empty(
  $$select r.rolname || ' -> ' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'),('authenticated'),('service_role')) as r(rolname)
     where n.nspname = 'private'
       and has_function_privilege(r.rolname, p.oid, 'execute')
    except select unnest(array[
      -- Policy RLS di PR-0: l'owner deve poter valutare le proprie policy (§6.7).
      'authenticated -> is_site_owner',
      'authenticated -> is_platform_admin',
      'authenticated -> owner_content_policy',
      -- Predicato di consenso della vista public_contacts (migrazione proiezioni).
      'anon -> contact_is_public',
      'authenticated -> contact_is_public',
      'service_role -> contact_is_public',
      -- Validatori invocati dai CHECK, ciascuno al solo ruolo che PR-0 autorizza
      -- a scrivere la tabella vincolata. `authenticated` non scrive site_tracks:
      -- non riceve valid_embed_url.
      'authenticated -> is_https_url',
      'authenticated -> valid_site_config_draft',
      'service_role -> is_https_url',
      'service_role -> valid_embed_url',
      'service_role -> valid_site_config_draft'
    ])$$,
  'nessun ruolo della Data API esegue una funzione private fuori dall''elenco dichiarato'
);

-- §6.8 alla lettera: le funzioni-trigger non sono endpoint.
select ok(not has_function_privilege('public', 'private.set_updated_at()', 'execute'),
  'PUBLIC non esegue la trigger function set_updated_at');
select ok(not has_function_privilege('public', 'private.create_site_dependents()', 'execute'),
  'PUBLIC non esegue la trigger function create_site_dependents');
select ok(not has_function_privilege('public', 'private.handle_new_user()', 'execute'),
  'PUBLIC non esegue la trigger function handle_new_user');

-- Le funzioni privilegiate restano chiuse ai ruoli del client.
select ok(not has_function_privilege('anon', 'private.reserve_upload(uuid,public.reservation_kind,bigint,integer,integer)', 'execute'),
  'anon non esegue reserve_upload');
select ok(not has_function_privilege('authenticated', 'private.reserve_upload(uuid,public.reservation_kind,bigint,integer,integer)', 'execute'),
  'authenticated non esegue reserve_upload');
select ok(not has_function_privilege('authenticated', 'private.site_is_publishable(uuid)', 'execute'),
  'authenticated non esegue site_is_publishable');
select ok(not has_function_privilege('anon', 'private.valid_embed_url(public.embed_provider,text)', 'execute'),
  'anon non esegue valid_embed_url: anon non scrive nulla');

-- ---------------------------------------------------------------------------
-- 5. Lo schema `private` resta chiuso. E' la differenza fra concedere EXECUTE su
--    una funzione e aprire lo schema: senza USAGE la funzione non e' risolvibile
--    per nome, quindi non diventa una superficie richiamabile. I CHECK e le policy
--    la valutano lo stesso, perche' le loro espressioni sono gia' risolte e a
--    runtime resta da verificare il solo EXECUTE.
-- ---------------------------------------------------------------------------
select ok(not has_schema_privilege('anon', 'private', 'usage'),
  'anon non ha USAGE sullo schema private');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated non ha USAGE sullo schema private');
select ok(not has_schema_privilege('service_role', 'private', 'usage'),
  'service_role non ha USAGE sullo schema private');

set local role service_role;
select throws_ok(
  $$select private.valid_embed_url('spotify','https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '42501',
  'permission denied for schema private',
  'service_role non puo'' invocare valid_embed_url per nome: manca USAGE sullo schema'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$select private.is_site_owner('22222222-2222-2222-2222-222222222222')$$,
  '42501',
  'permission denied for schema private',
  'authenticated non puo'' invocare is_site_owner per nome pur avendone EXECUTE'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Perche' i test RLS di PR-0 passavano gia'.
--    Non per fortuna: le tre funzioni usate dalle policy sono le uniche tre a cui
--    PR-0 concede EXECUTE, e `service_role` le policy non le valuta affatto.
--    Le policy non erano rotte; erano rotti i CHECK, che nessun test attraversava
--    con un ruolo reale.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'private.is_site_owner(uuid)', 'execute'),
  'le policy dell''owner funzionano perche'' authenticated ha EXECUTE su is_site_owner');
select ok(has_function_privilege('authenticated', 'private.owner_content_policy(uuid)', 'execute'),
  'idem per owner_content_policy, usata dalle policy di contenuto');
select ok((select rolbypassrls from pg_roles where rolname = 'service_role'),
  'service_role ha BYPASSRLS: non valuta le policy, quindi non ne serviva EXECUTE');
select ok(not has_function_privilege('anon', 'private.is_site_owner(uuid)', 'execute'),
  'anon non ha EXECUTE su is_site_owner: nessuna policy anon la nomina');

select * from finish();
rollback;
