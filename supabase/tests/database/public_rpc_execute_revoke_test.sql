-- Banco per la revoca dell'EXECUTE di default sulle RPC di `public`.
--
-- COSA MISURA, E PERCHE' NON BASTAVA QUELLO CHE C'ERA
-- `pr_0_contract_test.sql` verifica gia' che una chiamata non autorizzata a
-- `moderate_site` finisca con SQLSTATE 42501. Passava anche prima di questa
-- migrazione, e sarebbe passato anche con la funzione aperta al mondo: 42501 e' lo
-- stesso codice che il corpo della funzione solleva con
-- `using errcode='insufficient_privilege'`. Il codice da solo non distingue "sei
-- entrato e ti ho detto di no" da "non sei entrato". Qui la differenza e' scritta:
-- per `anon` si pretende il messaggio `permission denied for function ...`, che
-- solo il gestore dei privilegi puo' produrre, e per `authenticated` non-admin si
-- pretende `not platform admin`, che solo il corpo puo' produrre. Le due difese
-- restano cosi' misurate separatamente, e la seconda non puo' piu' mascherare
-- l'assenza della prima.
--
-- LA TERZA COSA, CHE E' QUELLA CHE MANCAVA DAVVERO
-- L'advisor Supabase non ha eseguito nulla: ha letto `pg_proc.proacl`. Nessun test
-- di questo repository leggeva l'ACL delle funzioni di `public`, quindi la
-- superficie era invisibile alla CI anche a suite verde. La sezione 1 legge il
-- catalogo con lo stesso criterio dell'advisor ed e' esaustiva: non chiede "le due
-- funzioni che conosco sono chiuse?" ma "esiste una funzione SECURITY DEFINER in
-- `public` eseguibile da PUBLIC o da `anon`?".
--
-- DUE AMBIENTI, UNA SOLA ASSERZIONE
-- Sul progetto cloud reale l'ACL di partenza contiene sia `=X/postgres` (PUBLIC)
-- sia `anon=X/postgres`, perche' quel progetto porta i default privileges legacy
-- che espongono ai ruoli della Data API ogni oggetto creato da `postgres` in
-- `public`. Lo stack locale della CLI, con `auto_expose_new_tables` non impostato,
-- ha il solo `=X/postgres`. Le asserzioni qui sotto sono scritte per essere vere
-- in entrambi: parlano di privilegio effettivo e di voci ACL per PUBLIC, `anon` e
-- `authenticated`, e non nominano mai `service_role`, la cui voce esiste sul cloud
-- e non in locale. `service_role` non e' toccato dalla migrazione: e' il ruolo di
-- backend e webhook, la sua chiave non raggiunge il browser, e la migrazione B gli
-- concede esplicitamente le proprie due funzioni.

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- 1. L'ACL, letta dal catalogo. E' il presidio che l'advisor usava e pgTAP no.
-- ---------------------------------------------------------------------------

-- La forma esatta dell'ACL delle due RPC, limitata ai tre soggetti che la
-- migrazione governa. `aclexplode` su un `proacl` NULL non restituirebbe righe, e
-- un `proacl` NULL significa "default", cioe' proprio EXECUTE a PUBLIC: il
-- `coalesce` con `acldefault` evita che il caso peggiore passi per un'assenza.
select results_eq(
  $$select (p.proname::text collate "default") || ' -> ' || coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname in ('moderate_site', 'request_site_review')
       and a.privilege_type = 'EXECUTE'
       and coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') in ('PUBLIC', 'anon', 'authenticated')
     order by 1$$,
  array['moderate_site -> authenticated', 'request_site_review -> authenticated'],
  'proacl: sulle due RPC resta la sola voce EXECUTE di authenticated, niente =X/ e niente anon=X/'
);

-- Esaustivo, con il criterio dell'advisor: SECURITY DEFINER in `public`.
select is_empty(
  $$select r.rolname || ' -> ' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('public')) as r(rolname)
     where n.nspname = 'public'
       and p.prosecdef
       and has_function_privilege(r.rolname, p.oid, 'execute')$$,
  'nessuna funzione SECURITY DEFINER dello schema public e'' eseguibile da anon o da PUBLIC'
);

-- L'inventario che rende esaustiva l'asserzione precedente. Se una migrazione
-- futura aggiunge una RPC in `public`, questa riga diventa rossa e obbliga a
-- decidere i suoi privilegi invece di ereditarli dal default di Postgres.
select results_eq(
  $$select (p.proname::text collate "default")
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef order by 1$$,
  array['apply_billing_event', 'billing_context', 'moderate_site', 'request_site_review'],
  'le funzioni SECURITY DEFINER di public sono le quattro dichiarate, nessuna di piu'''
);

select ok(not has_function_privilege('anon', 'public.moderate_site(uuid,public.moderation_action,text)', 'execute'),
  'anon non ha EXECUTE su moderate_site');
select ok(not has_function_privilege('anon', 'public.request_site_review(uuid)', 'execute'),
  'anon non ha EXECUTE su request_site_review');
select ok(not has_function_privilege('public', 'public.moderate_site(uuid,public.moderation_action,text)', 'execute'),
  'PUBLIC non ha EXECUTE su moderate_site');
select ok(not has_function_privilege('public', 'public.request_site_review(uuid)', 'execute'),
  'PUBLIC non ha EXECUTE su request_site_review');

-- ---------------------------------------------------------------------------
-- 2. Cosa DEVE fallire: `anon` non entra piu' nella funzione.
--    Prima della migrazione queste due righe erano rosse -- non perche' la
--    chiamata riuscisse, ma perche' falliva per la ragione sbagliata.
-- ---------------------------------------------------------------------------

-- Controllo: `anon` ha USAGE su `public` (PR-0 riga 266). Se non l'avesse, il
-- diniego sarebbe `permission denied for schema public` e questi test vincerebbero
-- per un motivo che non ha nulla a che vedere con la migrazione.
select ok(has_schema_privilege('anon', 'public', 'usage'),
  'controllo: anon ha USAGE su public, quindi il diniego riguarda la funzione');

set local role anon;

select throws_ok(
  $$select public.moderate_site('22222222-2222-2222-2222-222222222222','suspend','tentativo anonimo')$$,
  '42501',
  'permission denied for function moderate_site',
  'anon: moderate_site negata dal privilegio, non da "not platform admin"'
);

select throws_ok(
  $$select public.request_site_review('22222222-2222-2222-2222-222222222222')$$,
  '42501',
  'permission denied for function request_site_review',
  'anon: request_site_review negata dal privilegio, non da "not site owner"'
);

reset role;

-- La revoca tocca i privilegi e nient'altro: il corpo resta quello di PR-0.
select results_eq(
  $$select (p.proname::text collate "default")
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('moderate_site','request_site_review') order by 1$$,
  array['moderate_site', 'request_site_review'],
  'le due RPC sono ancora SECURITY DEFINER: revocato il privilegio, non riscritta la funzione'
);

-- ---------------------------------------------------------------------------
-- 3. Cosa DEVE continuare a funzionare. Se questa sezione e' rossa, la revoca ha
--    rotto il prodotto: owner e platform admin usano le due RPC da `authenticated`.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.moderate_site(uuid,public.moderation_action,text)', 'execute'),
  'authenticated conserva EXECUTE su moderate_site (PR-0 riga 274)');
select ok(has_function_privilege('authenticated', 'public.request_site_review(uuid)', 'execute'),
  'authenticated conserva EXECUTE su request_site_review (PR-0 riga 274)');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Owner B sul proprio sito draft: entra nella funzione e viene fermato dal
-- controllo di pubblicabilita', SQLSTATE 23514. Un 42501 qui direbbe che la
-- revoca ha preso anche `authenticated`.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok(
  $$select public.request_site_review('55555555-5555-5555-5555-555555555555')$$,
  '23514',
  'site is not publishable',
  'owner: request_site_review entra nel corpo e viene fermata dal contenuto, non dal privilegio'
);

-- Owner A non e' platform admin: a fermarlo e' il corpo, con il proprio messaggio.
-- Stesso SQLSTATE della sezione 2 e ragione opposta: e' la riga che dimostra
-- perche' il codice da solo non bastava a distinguere le due difese.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$select public.moderate_site('22222222-2222-2222-2222-222222222222','suspend','non autorizzato')$$,
  '42501',
  'not platform admin',
  'authenticated non-admin: 42501 dal corpo, con messaggio diverso da quello del privilegio'
);

-- Il platform admin lavora davvero: la strada felice deve restare aperta.
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select lives_ok(
  $$select public.moderate_site('22222222-2222-2222-2222-222222222222','suspend','test pgTAP revoca')$$,
  'platform admin sospende un sito pubblicato dopo la revoca'
);

reset role;

select is(
  (select publication_status::text from public.sites where id = '22222222-2222-2222-2222-222222222222'),
  'suspended',
  'la sospensione ha avuto effetto: la revoca non ha svuotato la RPC'
);
select is(
  (select count(*)::integer from public.moderation_events
    where site_id = '22222222-2222-2222-2222-222222222222' and reason = 'test pgTAP revoca'),
  1,
  'la RPC ha scritto il proprio audit event'
);

-- ---------------------------------------------------------------------------
-- 4. Le due RPC di fatturazione restano dove la migrazione B le ha messe: solo
--    backend. La sezione 1 dimostra che non sono aperte ad anon; qui si dimostra
--    che questa migrazione non le ha nemmeno aperte al client autenticato.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.billing_context(uuid,public.plan_code)', 'execute'),
  'authenticated non esegue billing_context: resta di service_role');
select ok(not has_function_privilege('authenticated',
  'public.apply_billing_event(text,uuid,public.billing_status,public.plan_code,public.billing_interval,text,text,public.publication_status,text,text)', 'execute'),
  'authenticated non esegue apply_billing_event: resta di service_role');

select * from finish();
rollback;
