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

-- Owner B: sito draft, mai leggibile da anon e isolato dall'owner A.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated', 'owner-b@example.test', crypt('local-only', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Owner B"}'::jsonb,
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into public.sites (id, owner_id, slug)
values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'owner-b-draft')
on conflict (id) do nothing;

insert into public.site_assets (id, site_id, kind, storage_path, mime_type, byte_size, sort_order)
values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'visual', 'seed/owner-b-hero.jpg', 'image/jpeg', 1024, 0)
on conflict (id) do nothing;

-- Owner C: sito in revisione, anch'esso invisibile al pubblico.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '77777777-7777-7777-7777-777777777777',
  'authenticated', 'authenticated', 'owner-c@example.test', crypt('local-only', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Owner C"}'::jsonb,
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into public.sites (id, owner_id, slug)
values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'owner-c-review')
on conflict (id) do nothing;

update public.sites set publication_status = 'pending_review'
where id = '88888888-8888-8888-8888-888888888888';

-- Owner C è anche platform admin per il test di lettura globale, senza privilegi di update generici.
insert into public.platform_admins (user_id)
values ('77777777-7777-7777-7777-777777777777')
on conflict (user_id) do nothing;
