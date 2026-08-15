-- Filone B — invarianti database del ciclo di vita billing.
-- Il database non si fida della decisione applicativa: qui si verifica che
-- rifiuti da solo le transizioni illegali, la pubblicazione sotto hold, la
-- doppia applicazione dello stesso evento e la scrittura dal client.

begin;
select plan(44);

-- ---------------------------------------------------------------------------
-- Fixture. Vive dentro la transazione e sparisce al rollback: non tocca
-- supabase/seed.sql, che appartiene a PR-0.
-- ---------------------------------------------------------------------------
insert into public.sites (id, owner_id, slug) values
  ('b1000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','test-b-published'),
  ('b2000000-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111','test-b-draft'),
  ('b3000000-0000-4000-8000-000000000003','11111111-1111-1111-1111-111111111111','test-b-hold'),
  ('b4000000-0000-4000-8000-000000000004','11111111-1111-1111-1111-111111111111','test-b-incompleto');

insert into public.site_assets (id, site_id, kind, storage_path, mime_type, byte_size) values
  ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','visual','test-b/hero-1.jpg','image/jpeg',200000000),
  ('c2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','visual','test-b/hero-2.jpg','image/jpeg',1024),
  ('c3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000003','visual','test-b/hero-3.jpg','image/jpeg',1024);

update public.site_config set
  config = '{
    "version": 1,
    "identity": {"name":"Test B","handle":"test-b","claim":"Claim","shortBio":"Breve.","longBio":"Lunga.","location":"Milano","locale":"it-IT"},
    "theme": {"ink":"#111111","panel":"#1a1a1a","paper":"#f5f2ea","muted":"#a0a0a0","dim":"#666666","line":"#333333","acid":"#ccff00"},
    "fontPair":"grotesk-mono","iconFamily":"line","grain":false,
    "surfaces":[{"id":"feed","enabled":true},{"id":"listen","enabled":true},{"id":"epk","enabled":true},{"id":"merch","enabled":true},{"id":"home","enabled":true}],
    "sectionCopy":{"version":1}
  }'::jsonb,
  hero_asset_id = case site_id
    when 'b1000000-0000-4000-8000-000000000001' then 'c1000000-0000-4000-8000-000000000001'::uuid
    when 'b2000000-0000-4000-8000-000000000002' then 'c2000000-0000-4000-8000-000000000002'::uuid
    else 'c3000000-0000-4000-8000-000000000003'::uuid end
where site_id in (
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000003');

-- Il sito pubblicato sta dentro MAX ma fuori BASE: il downgrade a BASE e' un
-- downgrade EFFETTIVO oltre quota.
update public.site_usage
   set used_bytes = 200000000, used_photo_slots = 20, used_upload_tracks = 5
 where site_id = 'b1000000-0000-4000-8000-000000000001';

update public.site_subscriptions
   set plan_code = 'max', billing_interval = 'year', billing_status = 'active'
 where site_id = 'b1000000-0000-4000-8000-000000000001';

update public.sites set publication_status = 'published', approved_at = now()
 where id = 'b1000000-0000-4000-8000-000000000001';

-- Hold di moderazione: sito gia' approvato, sospeso dall'amministratore.
update public.sites
   set publication_status = 'suspended', approved_at = now(),
       moderation_suspended_at = now(), moderation_reason = 'fixture filone B'
 where id = 'b3000000-0000-4000-8000-000000000003';
update public.site_subscriptions set billing_status = 'past_due'
 where site_id = 'b3000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Oggetti e privilegi.
-- ---------------------------------------------------------------------------
select has_table('public', 'billing_events', 'registro degli eventi billing esiste');
select has_function('public', 'apply_billing_event',
  array['text','uuid','billing_status','plan_code','billing_interval','text','text','publication_status','text','text'],
  'applicazione dell evento billing esiste');
select has_function('public', 'billing_context', array['uuid','plan_code'], 'contesto billing esiste');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.billing_events'::regclass),
  'billing_events ha RLS e FORCE RLS');

select ok(has_function_privilege('service_role',
  'public.apply_billing_event(text,uuid,public.billing_status,public.plan_code,public.billing_interval,text,text,public.publication_status,text,text)', 'execute'),
  'service_role puo applicare un evento billing');
select ok(not has_function_privilege('authenticated',
  'public.apply_billing_event(text,uuid,public.billing_status,public.plan_code,public.billing_interval,text,text,public.publication_status,text,text)', 'execute'),
  'authenticated non puo applicare un evento billing');
select ok(not has_function_privilege('anon',
  'public.apply_billing_event(text,uuid,public.billing_status,public.plan_code,public.billing_interval,text,text,public.publication_status,text,text)', 'execute'),
  'anon non puo applicare un evento billing');
select ok(not has_function_privilege('authenticated', 'public.billing_context(uuid,public.plan_code)', 'execute'),
  'authenticated non puo leggere il contesto billing');

-- Audit append-only: nemmeno service_role puo riscrivere la storia.
select ok(not has_table_privilege('service_role', 'public.billing_events', 'update'),
  'service_role non ha UPDATE su billing_events');
select ok(not has_table_privilege('service_role', 'public.billing_events', 'delete'),
  'service_role non ha DELETE su billing_events');

-- ---------------------------------------------------------------------------
-- 2. Il client non scrive stato, billing o audit.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$update public.sites set publication_status='published' where id='b2000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'owner non scrive publication_status: SQLSTATE 42501');
select throws_ok(
  $$update public.site_subscriptions set billing_status='active' where site_id='b2000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'owner non scrive billing_status: SQLSTATE 42501');
select throws_ok(
  $$update public.site_usage set used_bytes=0 where site_id='b1000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner non scrive usage: SQLSTATE 42501');
select throws_ok(
  $$insert into public.billing_events(stripe_event_id,site_id,rule,billing_status,plan_code,billing_interval,from_status,to_status)
    values ('evt_client','b2000000-0000-4000-8000-000000000002','falso','active','base','year','draft','published')$$,
  '42501', null, 'owner non scrive l audit billing: SQLSTATE 42501');
select throws_ok(
  $$select public.apply_billing_event('evt_client_2','b2000000-0000-4000-8000-000000000002','active','base','year',null,null,'published','clear','falso')$$,
  '42501', null, 'owner non invoca apply_billing_event: SQLSTATE 42501');
select is(
  (select publication_status::text from public.sites where id='b2000000-0000-4000-8000-000000000002'),
  'draft', 'dopo i tentativi del client il sito e ancora draft');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Primo pagamento valido e idempotenza.
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  public.apply_billing_event('evt_primo_pagamento','b2000000-0000-4000-8000-000000000002',
    'trialing','base','year','sub_test_b','price_test_b','pending_review','clear','first_valid_payment'),
  'applied', 'primo pagamento valido applicato');
select is(
  (select publication_status::text from public.sites where id='b2000000-0000-4000-8000-000000000002'),
  'pending_review', 'draft -> pending_review con billing trialing (E2)');
select is(
  (select count(*)::integer from public.billing_events where stripe_event_id='evt_primo_pagamento'),
  1, 'un evento applicato produce un solo record di audit');

-- Stripe ritenta: la seconda consegna non deve produrre nessun effetto.
-- Il carico e' deliberatamente LEGALE anche come applicazione nuova (piano
-- diverso, stato invariato): se l'idempotenza saltasse, il test non
-- esploderebbe con un errore, riporterebbe il piano riscritto.
select is(
  public.apply_billing_event('evt_primo_pagamento','b2000000-0000-4000-8000-000000000002',
    'active','pro','month','sub_test_b','price_altro','pending_review','start','plan_change'),
  'duplicate', 'la riconsegna dello stesso evento e riconosciuta come duplicato');
select is(
  (select publication_status::text from public.sites where id='b2000000-0000-4000-8000-000000000002'),
  'pending_review', 'la riconsegna non cambia lo stato di pubblicazione');
select is(
  (select plan_code::text || '/' || billing_interval::text from public.site_subscriptions where site_id='b2000000-0000-4000-8000-000000000002'),
  'base/year', 'la riconsegna non riscrive piano e intervallo');
select is(
  (select count(*)::integer from public.billing_events where stripe_event_id='evt_primo_pagamento'),
  1, 'la riconsegna non produce un secondo record di audit');

-- ---------------------------------------------------------------------------
-- 4. Transizioni che il webhook non puo produrre.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.apply_billing_event('evt_approvazione_finta','b2000000-0000-4000-8000-000000000002',
      'active','base','year',null,null,'published','clear','first_valid_payment')$$,
  '23514', null, 'pending_review -> published resta del platform admin: SQLSTATE 23514');
select is(
  (select publication_status::text from public.sites where id='b2000000-0000-4000-8000-000000000002'),
  'pending_review', 'la transizione illegale non ha lasciato effetti');
select is(
  (select count(*)::integer from public.billing_events where stripe_event_id='evt_approvazione_finta'),
  0, 'una transizione illegale non lascia nemmeno un record di audit');

select throws_ok(
  $$select public.apply_billing_event('evt_config_incompleta','b4000000-0000-4000-8000-000000000004',
      'active','base','year',null,null,'pending_review','clear','first_valid_payment')$$,
  '23514', null, 'config incompleta non entra in revisione: SQLSTATE 23514');

select throws_ok(
  $$select public.apply_billing_event('evt_retention_ignota','b2000000-0000-4000-8000-000000000002',
      'active','base','year',null,null,'pending_review','sconosciuta','first_valid_payment')$$,
  '22023', null, 'azione di retention sconosciuta rifiutata: SQLSTATE 22023');

select throws_ok(
  $$select public.apply_billing_event('evt_sito_ignoto','b9000000-0000-4000-8000-000000000009',
      'active','base','year',null,null,'draft','none','no_change')$$,
  '23503', null, 'evento su un sito inesistente rifiutato: SQLSTATE 23503');

-- ---------------------------------------------------------------------------
-- 5. Il recupero pagamento non rimuove e non aggira un hold di moderazione.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.apply_billing_event('evt_recupero_con_hold','b3000000-0000-4000-8000-000000000003',
      'active','base','year',null,null,'published','clear','payment_recovered')$$,
  '23514', null, 'il recupero pagamento con hold non ripubblica: SQLSTATE 23514');
select is(
  (select publication_status::text from public.sites where id='b3000000-0000-4000-8000-000000000003'),
  'suspended', 'il sito con hold resta sospeso');
select ok(
  (select moderation_suspended_at is not null and moderation_reason is not null
     from public.sites where id='b3000000-0000-4000-8000-000000000003'),
  'il recupero pagamento non rimuove il hold di moderazione');

-- La disdetta di un sito sotto hold lo riporta a draft ma non cancella il hold.
select is(
  public.apply_billing_event('evt_disdetta_con_hold','b3000000-0000-4000-8000-000000000003',
    'canceled','base','year',null,null,'draft','start','cancellation'),
  'applied', 'la disdetta di un sito sotto hold e applicabile');
select ok(
  (select moderation_suspended_at is not null from public.sites where id='b3000000-0000-4000-8000-000000000003'),
  'la disdetta non cancella il hold: la moderazione non si aggira con una nuova sottoscrizione');

-- ---------------------------------------------------------------------------
-- 6. Retention a 90 giorni.
-- ---------------------------------------------------------------------------
select ok(
  (select subscription_ended_at is not null from public.sites where id='b3000000-0000-4000-8000-000000000003'),
  'la disdetta valorizza subscription_ended_at');
select is(
  (select purge_after - subscription_ended_at from public.sites where id='b3000000-0000-4000-8000-000000000003'),
  interval '90 days',
  'purge_after = subscription_ended_at + 90 giorni');

-- ---------------------------------------------------------------------------
-- 7. Downgrade oltre quota: blocca, non cancella.
-- ---------------------------------------------------------------------------
-- Lo schema private non e' raggiungibile da service_role: queste due letture
-- girano con il ruolo del test, non con quello del webhook.
reset role;
select ok(
  (select private.site_over_quota('b1000000-0000-4000-8000-000000000001','base')),
  'il piano BASE e effettivamente oltre quota per il sito pubblicato');
select ok(
  not (select private.site_over_quota('b1000000-0000-4000-8000-000000000001','max')),
  'il piano MAX resta dentro quota per lo stesso sito');
set local role service_role;

select is(
  public.apply_billing_event('evt_downgrade','b1000000-0000-4000-8000-000000000001',
    'active','base','month','sub_test_b1','price_base_mensile','draft','clear','downgrade_over_quota'),
  'applied', 'il downgrade oltre quota e applicato');
select is(
  (select publication_status::text from public.sites where id='b1000000-0000-4000-8000-000000000001'),
  'draft', 'downgrade oltre quota: published -> draft');
select is(
  (select count(*)::integer from public.site_assets where site_id='b1000000-0000-4000-8000-000000000001'),
  1, 'il downgrade non cancella gli asset');
select is(
  (select used_bytes from public.site_usage where site_id='b1000000-0000-4000-8000-000000000001'),
  200000000::bigint, 'il downgrade non azzera i contatori di uso');
select ok(
  (select subscription_ended_at is null and purge_after is null
     from public.sites where id='b1000000-0000-4000-8000-000000000001'),
  'un downgrade con billing valido non avvia la retention');

-- Il sito oltre quota non torna pubblicato nemmeno con un evento esplicito.
select throws_ok(
  $$select public.apply_billing_event('evt_ripubblica_oltre_quota','b1000000-0000-4000-8000-000000000001',
      'active','base','month',null,null,'published','clear','valid_payment_after_approval')$$,
  '23514', null, 'un sito oltre quota non viene ripubblicato: SQLSTATE 23514');

reset role;

select * from finish();
rollback;
