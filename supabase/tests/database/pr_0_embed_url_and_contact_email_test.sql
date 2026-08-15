-- Copertura mancante in PR-0: nessun test tocca gli embed né i contatti, quindi
-- lo schema può rifiutare ogni dato reale restando verde in CI.
-- Questo banco fissa entrambe le direzioni: cosa deve entrare e cosa deve essere
-- respinto, con lo SQLSTATE atteso dichiarato su ogni rifiuto.
begin;
select plan(17);

-- 1. Il validatore riconosce un URL canonico per ciascuno dei quattro provider.
select ok(
  private.valid_embed_url('spotify', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
  'valid_embed_url accetta open.spotify.com'
);
select ok(
  private.valid_embed_url('apple_music', 'https://embed.music.apple.com/it/album/demo/1'),
  'valid_embed_url accetta embed.music.apple.com'
);
select ok(
  private.valid_embed_url('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  'valid_embed_url accetta www.youtube.com'
);
select ok(
  private.valid_embed_url('soundcloud', 'https://soundcloud.com/nvll-click/demo'),
  'valid_embed_url accetta soundcloud.com'
);

-- 2. Gli stessi URL passano davvero il CHECK di tabella: la traccia entra.
-- Le tracce si inseriscono con il ruolo di default della suite, l'unico che può
-- valutare private.valid_embed_url: lo schema private è chiuso ai ruoli del client.
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Embed Spotify','embed','spotify','https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  'una traccia embed Spotify valida è inseribile'
);
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Embed Apple','embed','apple_music','https://embed.music.apple.com/it/album/demo/1')$$,
  'una traccia embed Apple Music valida è inseribile'
);
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Embed YouTube','embed','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ')$$,
  'una traccia embed YouTube valida è inseribile'
);
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Embed SoundCloud','embed','soundcloud','https://soundcloud.com/nvll-click/demo')$$,
  'una traccia embed SoundCloud valida è inseribile'
);

-- 3. Rifiuti attesi sugli embed, ciascuno con SQLSTATE dichiarato.
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Host camuffato','embed','spotify','https://open.spotify.com.evil.test/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '23514', null,
  'host fuori allowlist rifiutato: SQLSTATE 23514'
);
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Senza TLS','embed','spotify','http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '23514', null,
  'URL http invece di https rifiutato: SQLSTATE 23514'
);
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Provider mentito','embed','spotify','https://soundcloud.com/nvll-click/demo')$$,
  '23514', null,
  'provider dichiarato diverso dall''host reale rifiutato: SQLSTATE 23514'
);

-- 4. Il rifiuto avviene per la ragione giusta: a parlare è il CHECK di site_tracks.
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','Host camuffato','embed','spotify','https://open.spotify.com.evil.test/track/4cOdK2wGLETKBW3PvgPWqT')$$,
  '23514',
  'new row for relation "site_tracks" violates check constraint "site_tracks_check"',
  'host fuori allowlist: a rifiutare è site_tracks_check, non un errore generico'
);

-- Il punto separatore resta un punto letterale e non un metacarattere jolly:
-- una regex "riparata" togliendo del tutto l'escape accetterebbe questo host.
select ok(
  not private.valid_embed_url('spotify', 'https://openxspotifyxcom/track/4cOdK2wGLETKBW3PvgPWqT'),
  'il punto nella regex Spotify è letterale, non un jolly'
);

-- 5. Contatti: un'email ordinaria entra, una malformata no e per la ragione giusta.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','booking','Booking','booking@example.com')$$,
  'un contatto con email ordinaria è inseribile'
);
select throws_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','press','Press','bookingexample.com')$$,
  '23514',
  'new row for relation "site_contacts" violates check constraint "site_contacts_email_check"',
  'email senza @ rifiutata da site_contacts_email_check: SQLSTATE 23514'
);
select throws_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','management','Management','book ing@example.com')$$,
  '23514', null,
  'email con spazi rifiutata: SQLSTATE 23514'
);
-- Simmetrico del test sul punto negli host: se l'escape venisse tolto del tutto
-- invece che dimezzato, un dominio senza punto passerebbe.
select throws_ok(
  $$insert into public.site_contacts(site_id,role,name,email)
    values ('22222222-2222-2222-2222-222222222222','press','Press','booking@examplecom')$$,
  '23514', null,
  'email senza punto nel dominio rifiutata, il punto è letterale: SQLSTATE 23514'
);
reset role;

select * from finish();
rollback;
