begin;
select plan(12);

select has_table('public', 'sites', 'sites esiste');
select has_table('public', 'site_subscriptions', 'subscription per sito esiste');
select has_table('public', 'site_usage', 'contatori di quota esistono');
select has_table('public', 'site_upload_reservations', 'prenotazioni atomiche esistono');
select has_table('public', 'moderation_events', 'audit di moderazione esiste');
select has_column('public', 'site_config', 'hero_asset_id', 'hero relazionale esiste');
select has_column('public', 'site_contacts', 'consent_confirmed_at', 'consenso tracciato');
select has_function('public', 'request_site_review', array['uuid'], 'gate di review esiste');
select has_function('public', 'moderate_site', array['uuid','moderation_action','text'], 'azione moderazione esiste');

select results_eq(
  $$select code::text || ':' || storage_bytes::text from public.plans order by code$$,
  array['base:157286400','max:8589934592','pro:1073741824'],
  'quote storage E1 corrette'
);

select ok(
  (select billing_status = 'trialing' from public.site_subscriptions where site_id = '22222222-2222-2222-2222-222222222222'),
  'il seed usa trialing, valido per la promozione configurata da Stripe'
);

set local role anon;
select results_eq(
  $$select slug from public.public_sites order by slug$$,
  array['nvll-click'],
  'anon legge soltanto la fixture pubblicata attraverso la proiezione'
);
reset role;

select * from finish();
rollback;
