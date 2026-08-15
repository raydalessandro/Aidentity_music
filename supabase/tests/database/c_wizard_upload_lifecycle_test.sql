begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- 1. Superficie RPC: backend-only, senza aprire lo schema private.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.wizard_expire_uploads(uuid,uuid)', 'EXECUTE'),
  'authenticated non esegue expire upload'
);
select ok(
  not has_function_privilege('authenticated', 'public.wizard_reserve_upload(uuid,uuid,public.reservation_kind,bigint,integer,integer)', 'EXECUTE'),
  'authenticated non esegue reserve upload'
);
select ok(
  not has_function_privilege('authenticated', 'public.wizard_release_upload(uuid,uuid)', 'EXECUTE'),
  'authenticated non esegue release upload'
);
select ok(
  not has_function_privilege('authenticated', 'public.wizard_complete_asset_upload(uuid,uuid,public.asset_kind,text,text,bigint)', 'EXECUTE'),
  'authenticated non completa asset upload'
);
select ok(
  not has_function_privilege('authenticated', 'public.wizard_complete_track_upload(uuid,uuid,text,text,text,bigint)', 'EXECUTE'),
  'authenticated non completa track upload'
);
select ok(
  not has_function_privilege('anon', 'public.wizard_reserve_upload(uuid,uuid,public.reservation_kind,bigint,integer,integer)', 'EXECUTE'),
  'anon non esegue reserve upload'
);
select ok(
  not has_schema_privilege('service_role', 'private', 'usage'),
  'C non rompe il presidio esistente: service_role resta senza USAGE su private'
);
select ok(
  not has_function_privilege('service_role', 'private.wizard_reserve_upload(uuid,uuid,public.reservation_kind,bigint,integer,integer)', 'EXECUTE'),
  'service_role non invoca direttamente le implementazioni private di C'
);

-- ---------------------------------------------------------------------------
-- 2. Storage: INSERT + SELECT temporanei, tenant/path/byte scoped.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from pg_policies where schemaname='storage' and policyname='wizard_asset_storage_insert'),
  1,
  'policy Storage INSERT asset esiste'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='storage' and policyname='wizard_asset_storage_select'),
  1,
  'policy Storage SELECT asset esiste'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='storage' and policyname='wizard_track_storage_insert'),
  1,
  'policy Storage INSERT track esiste'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='storage' and policyname='wizard_track_storage_select'),
  1,
  'policy Storage SELECT track esiste'
);
select ok(
  (select cardinality(roles)=1 and 'authenticated' = any(roles)
   from pg_policies where schemaname='storage' and policyname='wizard_asset_storage_insert'),
  'policy asset è concessa solo ad authenticated'
);
select ok(
  (select cardinality(roles)=1 and 'authenticated' = any(roles)
   from pg_policies where schemaname='storage' and policyname='wizard_track_storage_insert'),
  'policy track è concessa solo ad authenticated'
);
select ok(
  (select with_check like '%byte_size%' and with_check like '%status = ''reserved''%' and with_check like '%expires_at%'
   from pg_policies where schemaname='storage' and policyname='wizard_asset_storage_insert'),
  'INSERT asset lega byte, stato attivo e scadenza alla prenotazione'
);
select ok(
  (select with_check like '%byte_size%' and with_check like '%status = ''reserved''%' and with_check like '%expires_at%'
   from pg_policies where schemaname='storage' and policyname='wizard_track_storage_insert'),
  'INSERT track lega byte, stato attivo e scadenza alla prenotazione'
);
select ok(
  (select qual like '%status = ''reserved''%' and qual like '%expires_at%'
   from pg_policies where schemaname='storage' and policyname='wizard_asset_storage_select')
  and
  (select qual like '%status = ''reserved''%' and qual like '%expires_at%'
   from pg_policies where schemaname='storage' and policyname='wizard_track_storage_select'),
  'la SELECT temporanea sparisce quando la prenotazione non è più attiva'
);

create temporary table c_reservations(kind text primary key, id uuid not null);
grant all on c_reservations to service_role;

set local role service_role;

-- ---------------------------------------------------------------------------
-- 3. Reserve + release: idempotenza e contatori.
-- ---------------------------------------------------------------------------
insert into c_reservations(kind,id)
select 'released', public.wizard_reserve_upload(
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'asset', 1024, 1, 0
);

select is(
  (select reserved_bytes from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  1024::bigint,
  'reserve incrementa i byte riservati'
);
select ok(
  public.wizard_release_upload(
    (select id from c_reservations where kind='released'),
    '44444444-4444-4444-4444-444444444444'
  ),
  'release attiva restituisce true'
);
select ok(
  not public.wizard_release_upload(
    (select id from c_reservations where kind='released'),
    '44444444-4444-4444-4444-444444444444'
  ),
  'release ripetuta è idempotente'
);
select is(
  (select reserved_bytes from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  0::bigint,
  'release azzera i byte riservati'
);

-- ---------------------------------------------------------------------------
-- 4. Consume asset: reserved -> used nello stesso commit DB.
-- ---------------------------------------------------------------------------
insert into c_reservations(kind,id)
select 'asset', public.wizard_reserve_upload(
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'asset', 2048, 1, 0
);

select lives_ok(
  format(
    $$select public.wizard_complete_asset_upload(%L::uuid,'44444444-4444-4444-4444-444444444444','photo_hi',%L,'image/jpeg',2048)$$,
    (select id from c_reservations where kind='asset'),
    '55555555-5555-5555-5555-555555555555/' || (select id::text from c_reservations where kind='asset') || '/object'
  ),
  'complete asset riesce solo col path della prenotazione'
);
select is(
  (select used_bytes from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  2048::bigint,
  'complete asset incrementa used_bytes'
);
select is(
  (select used_photo_slots from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  1,
  'complete asset incrementa lo slot foto'
);
select is(
  (select status::text from public.site_upload_reservations where id=(select id from c_reservations where kind='asset')),
  'consumed',
  'prenotazione asset diventa consumed'
);
select ok(
  not public.wizard_release_upload(
    (select id from c_reservations where kind='asset'),
    '44444444-4444-4444-4444-444444444444'
  ),
  'release non può retrocedere una prenotazione già consumed'
);
select is(
  (select used_bytes from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  2048::bigint,
  'release dopo consume non sottrae byte usati'
);

-- Embed è neutro: niente prenotazione e nessun contatore upload.
insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
values ('55555555-5555-5555-5555-555555555555','Embed neutro','embed','spotify','https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
select is(
  (select used_upload_tracks from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  0,
  'embed non consuma slot traccia upload'
);

-- ---------------------------------------------------------------------------
-- 5. Expiry: quota fantasma rimossa una volta sola.
-- ---------------------------------------------------------------------------
insert into c_reservations(kind,id)
select 'expired', public.wizard_reserve_upload(
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'track_upload', 4096, 0, 1
);
update public.site_upload_reservations
set expires_at = now() - interval '1 second'
where id=(select id from c_reservations where kind='expired');

select is(
  public.wizard_expire_uploads(
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444'
  ),
  1,
  'expire riconcilia una prenotazione scaduta'
);
select is(
  (select reserved_upload_tracks from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  0,
  'expire rilascia lo slot traccia riservato'
);
select is(
  (select status::text from public.site_upload_reservations where id=(select id from c_reservations where kind='expired')),
  'expired',
  'prenotazione scaduta diventa expired'
);
select is(
  public.wizard_expire_uploads(
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444'
  ),
  0,
  'expire ripetuto è idempotente'
);

-- ---------------------------------------------------------------------------
-- 6. Track upload: stessa macchina, slot upload effettivo.
-- ---------------------------------------------------------------------------
insert into c_reservations(kind,id)
select 'track', public.wizard_reserve_upload(
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'track_upload', 8192, 0, 1
);

select lives_ok(
  format(
    $$select public.wizard_complete_track_upload(%L::uuid,'44444444-4444-4444-4444-444444444444','Track upload',%L,'audio/mpeg',8192)$$,
    (select id from c_reservations where kind='track'),
    '55555555-5555-5555-5555-555555555555/' || (select id::text from c_reservations where kind='track') || '/object'
  ),
  'complete track upload riesce'
);
select is(
  (select used_upload_tracks from public.site_usage where site_id='55555555-5555-5555-5555-555555555555'),
  1,
  'complete track incrementa uno slot upload'
);
select is(
  (select status::text from public.site_upload_reservations where id=(select id from c_reservations where kind='track')),
  'consumed',
  'prenotazione track diventa consumed'
);

-- ---------------------------------------------------------------------------
-- 7. Sicurezza/quote: actor errato e prenotazione oltre limite.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.wizard_reserve_upload(
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'asset', 512, 1, 0
  )$$,
  '42501',
  'not site owner',
  'RPC backend verifica anche owner/site'
);
select throws_ok(
  $$select public.wizard_reserve_upload(
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444',
    'track_upload', 1024, 0, 3
  )$$,
  '23514',
  'plan quota exceeded',
  'used + reserved non può oltrepassare la quota del piano'
);

reset role;
select * from finish();
rollback;
