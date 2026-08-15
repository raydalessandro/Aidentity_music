begin;
select plan(27);

-- 1. Oggetti, vincoli e piani canonici.
select has_table('public', 'sites', 'sites esiste');
select has_table('public', 'site_subscriptions', 'subscription per sito esiste');
select has_table('public', 'site_usage', 'contatori di quota esistono');
select has_table('public', 'site_upload_reservations', 'prenotazioni atomiche esistono');
select has_table('public', 'moderation_events', 'audit di moderazione esiste');
select has_column('public', 'site_config', 'hero_asset_id', 'hero relazionale esiste');
select has_function('public', 'request_site_review', array['uuid'], 'gate di review esiste');
select has_function('public', 'moderate_site', array['uuid','moderation_action','text'], 'azione moderazione esiste');
select results_eq(
  $$select code::text || ':' || storage_bytes::text from public.plans order by code$$,
  array['base:157286400','pro:1073741824','max:8589934592'],
  'quote storage E1 corrette'
);
select ok(
  (select billing_status = 'trialing' from public.site_subscriptions where site_id = '22222222-2222-2222-2222-222222222222'),
  'trialing è presente nella fixture come billing valido'
);

-- 2. anon legge esclusivamente la proiezione del sito pubblicato.
set local role anon;
select results_eq($$select slug from public.public_sites order by slug$$, array['nvll-click'], 'anon vede soltanto il sito pubblicato');
select results_eq($$select slug from public.public_sites where slug='owner-b-draft'$$, array[]::text[], 'anon non legge il draft');
select results_eq($$select slug from public.public_sites where slug='owner-c-review'$$, array[]::text[], 'anon non legge pending_review');
reset role;

-- 3. owner A non legge né scrive dati di B.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq($$select slug from public.sites order by slug$$, array['nvll-click'], 'owner A legge soltanto il proprio sito');
select results_eq($$select slug from public.sites where id='55555555-5555-5555-5555-555555555555'$$, array[]::text[], 'owner A non legge il sito B');
select throws_ok(
  $$insert into public.site_links(site_id,provider,url) values ('55555555-5555-5555-5555-555555555555','spotify','https://open.spotify.com/track/test')$$,
  '42501', null,
  'owner A non scrive dati di B: SQLSTATE 42501'
);

-- 4. Nemmeno service_role può creare una FK tra tenant diversi.
set local role service_role;
select throws_ok(
  $$insert into public.site_posts(site_id,kind,visual_asset_id) values ('22222222-2222-2222-2222-222222222222','visual','66666666-6666-6666-6666-666666666666')$$,
  '23503', null,
  'FK composita rifiuta un asset B su un post A: SQLSTATE 23503'
);
reset role;

-- 5. Il client non modifica stato, billing, usage, upload asset o upload track.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$update public.sites set publication_status='published' where id='22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'client non modifica publication_status: SQLSTATE 42501'
);
select throws_ok(
  $$update public.site_subscriptions set billing_status='active' where site_id='22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'client non modifica billing: SQLSTATE 42501'
);
select throws_ok(
  $$update public.site_usage set used_bytes=1 where site_id='22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'client non modifica usage: SQLSTATE 42501'
);
select throws_ok(
  $$insert into public.site_assets(site_id,kind,storage_path,mime_type,byte_size) values ('22222222-2222-2222-2222-222222222222','visual','forbidden/client.jpg','image/jpeg',1)$$,
  '42501', null, 'client non inserisce asset upload: SQLSTATE 42501'
);
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,storage_path,mime_type,byte_size) values ('22222222-2222-2222-2222-222222222222','forbidden','upload','forbidden/client.mp3','audio/mpeg',1)$$,
  '42501', null, 'client non inserisce tracce upload: SQLSTATE 42501'
);
select throws_ok(
  $$insert into public.moderation_events(site_id,actor_id,action) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','approve')$$,
  '42501', null, 'client non scrive audit direttamente: SQLSTATE 42501'
);
reset role;

-- 6. Il platform admin legge tutto, ma senza UPDATE generale.
set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq($$select count(*)::integer from public.sites$$, array[3], 'platform admin legge i tre siti');
select throws_ok(
  $$update public.sites set publication_status='published' where id='55555555-5555-5555-5555-555555555555'$$,
  '42501', null, 'platform admin usa moderate_site, non UPDATE generale: SQLSTATE 42501'
);
reset role;

-- 7. RLS è una proprietà effettiva dello schema pubblico.
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.sites'::regclass), 'sites ha RLS e FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.site_subscriptions'::regclass), 'subscription ha RLS e FORCE RLS');

select * from finish();
rollback;
