-- AIDENTITY — allowlist embed: SoundCloud ammette anche `www.soundcloud.com`.
--
-- Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md §5, che per SoundCloud
-- elenca `soundcloud.com` **o** `www.soundcloud.com`. PR-0 aveva recepito solo il primo.
--
-- Il presidio non legge la regex a occhio: fa passare URL veri dal CHECK di
-- `public.site_tracks`, che è il punto in cui il contratto morde davvero.
--
-- Ogni caso negativo dichiara il proprio SQLSTATE atteso — `23514`, violazione di
-- CHECK. Un `throws_ok` senza codice passerebbe anche per un errore di sintassi o per
-- un permesso mancante, cioè per il motivo sbagliato, e direbbe "rifiutato" dove noi
-- vogliamo leggere "rifiutato perché l'URL non è nell'allowlist".
--
-- Gli insert girano con il ruolo con cui la migrazione è stata applicata, non con
-- `service_role`: il CHECK invoca `private.valid_embed_url`, e su questo schema il
-- ruolo `service_role` non ha USAGE su `private`, quindi otterrebbe `42501` prima
-- ancora di arrivare al vincolo di dominio. Isolare il vincolo è il punto del file.

begin;
select plan(21);

select has_function(
  'private', 'valid_embed_url', array['embed_provider','text'],
  'la funzione normativa dell allowlist embed esiste'
);

-- ---------------------------------------------------------------------------
-- 1. Il difetto corretto: `www.soundcloud.com` è accettato.
--    Prima di questa migrazione la stessa riga veniva respinta con 23514.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','www accettato','embed','soundcloud',
            'https://www.soundcloud.com/artista/traccia')$$,
  'www.soundcloud.com entra in site_tracks: è la prova del difetto corretto'
);

-- ---------------------------------------------------------------------------
-- 2. Nessuna regressione: l'host già ammesso resta ammesso.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','nudo accettato','embed','soundcloud',
            'https://soundcloud.com/artista/traccia')$$,
  'soundcloud.com resta accettato: nessuna regressione'
);

select results_eq(
  $$select embed_url from public.site_tracks
    where site_id='22222222-2222-2222-2222-222222222222' and embed_provider='soundcloud'
    order by embed_url$$,
  array[
    'https://soundcloud.com/artista/traccia',
    'https://www.soundcloud.com/artista/traccia'
  ],
  'entrambe le forme SoundCloud sono righe reali, non solo espressioni booleane'
);

-- ---------------------------------------------------------------------------
-- 3. Casi che DEVONO essere rifiutati, con SQLSTATE dichiarato.
--    Allargare l'host non deve aprire una crepa: `www.soundcloud.com` sì,
--    `www.soundcloud.com.evil.test` no.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','suffisso ostile','embed','soundcloud',
            'https://soundcloud.com.evil.test/x')$$,
  '23514', null,
  'host che prefissa quello lecito respinto: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','suffisso ostile su www','embed','soundcloud',
            'https://www.soundcloud.com.evil.test/x')$$,
  '23514', null,
  'l host aggiunto non diventa un prefisso libero: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','host arbitrario','embed','soundcloud',
            'https://evil.test/soundcloud.com/x')$$,
  '23514', null,
  'host lecito spostato nel path respinto: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','schema in chiaro','embed','soundcloud',
            'http://www.soundcloud.com/artista/traccia')$$,
  '23514', null,
  'http al posto di https respinto anche sull host nuovo: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','provider incrociato','embed','soundcloud',
            'https://open.spotify.com/track/1')$$,
  '23514', null,
  'host di un provider dichiarato diverso respinto: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','apple con host soundcloud','embed','apple_music',
            'https://www.soundcloud.com/artista/traccia')$$,
  '23514', null,
  'l host SoundCloud non vale per apple_music: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','host del player','embed','soundcloud',
            'https://w.soundcloud.com/player/?url=x')$$,
  '23514', null,
  'w.soundcloud.com è destinazione iframe, non host memorizzabile: SQLSTATE 23514'
);

-- ---------------------------------------------------------------------------
-- 4. L'allowlist non allenta il resto del CHECK sulla forma `embed`.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url,storage_path,mime_type,byte_size)
    values ('22222222-2222-2222-2222-222222222222','ibrido','embed','soundcloud',
            'https://www.soundcloud.com/artista/traccia','x/y.mp3','audio/mpeg',1)$$,
  '23514', null,
  'un embed con campi da upload resta impossibile: SQLSTATE 23514'
);

select throws_ok(
  $$insert into public.site_tracks(site_id,title,source,embed_provider,embed_url)
    values ('22222222-2222-2222-2222-222222222222','embed senza url','embed','soundcloud',null)$$,
  '23514', null,
  'un embed senza URL resta impossibile: SQLSTATE 23514'
);

-- ---------------------------------------------------------------------------
-- 5. Gli altri tre provider restano identici a L0.7 §5.
--    Prima il comportamento, poi il testo: un test che guardasse solo la stringa
--    passerebbe anche se la definizione viva fosse un'altra.
-- ---------------------------------------------------------------------------
select is(
  array[
    private.valid_embed_url('spotify','https://open.spotify.com/track/1'),
    private.valid_embed_url('apple_music','https://music.apple.com/it/album/1'),
    private.valid_embed_url('apple_music','https://embed.music.apple.com/it/album/1'),
    private.valid_embed_url('youtube','https://youtube.com/watch?v=abc'),
    private.valid_embed_url('youtube','https://www.youtube.com/watch?v=abc'),
    private.valid_embed_url('youtube','https://music.youtube.com/watch?v=abc'),
    private.valid_embed_url('youtube','https://youtu.be/abc')
  ],
  array[true,true,true,true,true,true,true],
  'i sette host degli altri tre provider restano tutti accettati'
);

select is(
  array[
    private.valid_embed_url('spotify','https://open.spotify.com.evil.test/track/1'),
    private.valid_embed_url('apple_music','https://music.apple.com.evil.test/it/album/1'),
    private.valid_embed_url('youtube','https://www.youtube.com.evil.test/watch?v=abc'),
    private.valid_embed_url('spotify','https://spotify.com/track/1'),
    private.valid_embed_url('youtube','https://youtube.be/abc'),
    private.valid_embed_url('spotify','http://open.spotify.com/track/1')
  ],
  array[false,false,false,false,false,false],
  'gli altri tre provider non si sono allargati insieme a SoundCloud'
);

-- Invarianza testuale, carattere per carattere, sulla definizione viva.
-- `pg_get_functiondef` legge il catalogo, non i file di migrazione: se una
-- migrazione futura riscrivesse una di queste clausole, qui diventa rosso.
select ok(
  strpos(
    pg_get_functiondef('private.valid_embed_url(public.embed_provider,text)'::regprocedure),
    $q$when 'spotify' then value ~ '^https://open\.spotify\.com/'$q$
  ) > 0,
  'clausola spotify invariata carattere per carattere'
);

select ok(
  strpos(
    pg_get_functiondef('private.valid_embed_url(public.embed_provider,text)'::regprocedure),
    $q$when 'apple_music' then value ~ '^https://(music\.apple\.com|embed\.music\.apple\.com)/'$q$
  ) > 0,
  'clausola apple_music invariata carattere per carattere'
);

select ok(
  strpos(
    pg_get_functiondef('private.valid_embed_url(public.embed_provider,text)'::regprocedure),
    $q$when 'youtube' then value ~ '^https://(youtube\.com|www\.youtube\.com|music\.youtube\.com|youtu\.be)/'$q$
  ) > 0,
  'clausola youtube invariata carattere per carattere'
);

select ok(
  strpos(
    pg_get_functiondef('private.valid_embed_url(public.embed_provider,text)'::regprocedure),
    $q$when 'soundcloud' then value ~ '^https://(soundcloud\.com|www\.soundcloud\.com)/'$q$
  ) > 0,
  'clausola soundcloud contiene esattamente i due host di L0.7 §5'
);

-- Il punto deve restare letterale. Con `\\.` la regex accetterebbe un carattere
-- qualsiasi al suo posto: è il difetto che su PR-0 rendeva la funzione inservibile,
-- e questa migrazione lo riscrive per intero proprio per non ereditarlo.
select is(
  array[
    private.valid_embed_url('soundcloud','https://wwwxsoundcloudxcom/artista/traccia'),
    private.valid_embed_url('soundcloud','https://soundcloudxcom/artista/traccia'),
    private.valid_embed_url('spotify','https://openxspotifyxcom/track/1')
  ],
  array[false,false,false],
  'il punto è letterale: nessun jolly al suo posto'
);

-- Nessun provider dell'enum resta scoperto o si apre a un dominio arbitrario.
select is(
  (select count(*)::integer from unnest(enum_range(null::public.embed_provider)) p
   where private.valid_embed_url(p,'https://evil.test/qualsiasi')),
  0,
  'nessun provider accetta un dominio HTTPS arbitrario'
);

select * from finish();
rollback;
