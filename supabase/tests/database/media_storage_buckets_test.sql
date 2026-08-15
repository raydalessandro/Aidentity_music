-- AIDENTITY — bucket Storage: privati, con allowlist, senza policy per `anon`.
--
-- Il valore che questo file difende è uno solo e sta in una colonna booleana: se
-- `storage.buckets.public` diventasse `true`, ogni asset di ogni sito — bozza compresa —
-- sarebbe leggibile da chi ne indovina il path, e la route media diventerebbe una formalità
-- aggirabile. Un test che si limitasse a verificare che il bucket «esiste» non direbbe
-- nulla di questo.

begin;
select plan(9);

-- ---------------------------------------------------------------------------
-- Esistenza. La migrazione è il solo posto in cui i bucket nascono.
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from storage.buckets where id = 'site-assets'),
  'il bucket site-assets esiste'
);
select ok(
  exists (select 1 from storage.buckets where id = 'site-tracks'),
  'il bucket site-tracks esiste'
);

-- ---------------------------------------------------------------------------
-- Privatezza. Rompere questa riga nella migrazione rende rosso questo test.
-- ---------------------------------------------------------------------------
select is(
  (select public from storage.buckets where id = 'site-assets'),
  false,
  'site-assets non è pubblico'
);
select is(
  (select public from storage.buckets where id = 'site-tracks'),
  false,
  'site-tracks non è pubblico'
);

-- ---------------------------------------------------------------------------
-- Allowlist dei tipi. `image/svg+xml` servito dalla nostra origine sarebbe XSS
-- same-origin; `video/*` è escluso dalla v1 per §5.
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1
    from storage.buckets b, unnest(b.allowed_mime_types) as t(mime)
    where b.id = 'site-assets' and t.mime = 'image/svg+xml'
  ),
  'site-assets non accetta SVG'
);
select ok(
  not exists (
    select 1
    from storage.buckets b, unnest(b.allowed_mime_types) as t(mime)
    where b.id = 'site-assets' and t.mime like 'video/%'
  ),
  'site-assets non accetta video in v1'
);
select ok(
  not exists (
    select 1
    from storage.buckets b, unnest(b.allowed_mime_types) as t(mime)
    where b.id = 'site-tracks' and t.mime not like 'audio/%'
  ),
  'site-tracks accetta soltanto audio'
);

-- ---------------------------------------------------------------------------
-- Accesso. RLS attiva e nessuna policy che nomini `anon`: il solo ruolo che
-- raggiunge questi oggetti è `service_role`, dietro la route media.
-- ---------------------------------------------------------------------------
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true,
  'RLS è attiva su storage.objects'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and 'anon' = any (roles)),
  0,
  'nessuna policy su storage.objects concede qualcosa ad anon'
);

select * from finish();
rollback;
