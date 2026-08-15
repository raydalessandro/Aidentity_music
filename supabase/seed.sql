-- Fixture locale/CI deterministica: nessun testo di bootstrap viene usato nel prodotto.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'nvll-click@example.test', crypt('local-only', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"NVLL CLICK"}'::jsonb,
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into public.sites (id, owner_id, slug)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'nvll-click')
on conflict (id) do nothing;

insert into public.site_assets (id, site_id, kind, storage_path, mime_type, byte_size, sort_order)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'visual', 'seed/nvll-click-hero.jpg', 'image/jpeg', 1024, 0)
on conflict (id) do nothing;

update public.site_config
set config = '{
  "version": 1,
  "identity": {"name":"NVLL CLICK","handle":"nvll-click","claim":"Electro-pop italiano","shortBio":"Fixture locale.","longBio":"Fixture locale per reset e test CI.","location":"Milano","locale":"it-IT"},
  "theme": {"ink":"#111111","panel":"#1a1a1a","paper":"#f5f2ea","muted":"#a0a0a0","dim":"#666666","line":"#333333","acid":"#ccff00"},
  "fontPair":"grotesk-mono","iconFamily":"line","grain":false,
  "surfaces":[{"id":"feed","enabled":true},{"id":"listen","enabled":true},{"id":"epk","enabled":true},{"id":"merch","enabled":true},{"id":"home","enabled":true}],
  "sectionCopy":{"version":1}
}'::jsonb,
hero_asset_id = '33333333-3333-3333-3333-333333333333'
where site_id = '22222222-2222-2222-2222-222222222222';

update public.site_subscriptions set billing_status = 'trialing'
where site_id = '22222222-2222-2222-2222-222222222222';

update public.sites set publication_status = 'published', approved_at = now()
where id = '22222222-2222-2222-2222-222222222222';
