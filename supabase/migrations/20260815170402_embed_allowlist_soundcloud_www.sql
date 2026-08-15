-- AIDENTITY — allineamento dell'allowlist embed alla fonte normativa.
-- Fonte: docs/L0.7-AIDENTITY-contratto-canonico.md §5, che per SoundCloud ammette
-- `soundcloud.com` **o** `www.soundcloud.com`. PR-0 aveva recepito solo il primo:
-- un URL legittimo con `www.` veniva rifiutato dal CHECK di `public.site_tracks`.
--
-- Gli altri tre provider restano identici a L0.7 §5 e non vengono toccati:
--   spotify      → open.spotify.com
--   apple_music  → music.apple.com | embed.music.apple.com
--   youtube      → youtube.com | www.youtube.com | music.youtube.com | youtu.be
--
-- Perché la funzione è riscritta per intero e non "corretta a pezzi":
-- `create or replace` sostituisce, non somma. La definizione qui sotto è quindi
-- l'unica che conta dopo l'applicazione, e deve essere completa e corretta da sola —
-- senza dipendere dall'ordine rispetto alla migrazione che sistema gli escape.
-- Per questo usa già il backslash singolo: dentro un corpo dollar-quoted non c'è
-- nessuno strato di escaping da compensare, e `'\\.'` significherebbe "backslash
-- letterale seguito da un carattere qualsiasi", non "punto letterale" — che è il
-- motivo per cui su PR-0 nessun URL embed risultava valido.
--
-- L'ancoraggio `^https://` più lo slash finale obbligatorio dopo l'host è ciò che
-- impedisce a `www.soundcloud.com.evil.test` di passare: l'host allargato è un
-- alternativo in più dentro il gruppo, non un prefisso libero.

create or replace function private.valid_embed_url(provider public.embed_provider, value text)
returns boolean language sql immutable set search_path = '' as $$
  select case provider
    when 'spotify' then value ~ '^https://open\.spotify\.com/'
    when 'apple_music' then value ~ '^https://(music\.apple\.com|embed\.music\.apple\.com)/'
    when 'youtube' then value ~ '^https://(youtube\.com|www\.youtube\.com|music\.youtube\.com|youtu\.be)/'
    when 'soundcloud' then value ~ '^https://(soundcloud\.com|www\.soundcloud\.com)/'
    else false end;
$$;

-- Il CHECK di `public.site_tracks` invoca la funzione: le righe già presenti non
-- vengono rivalidate da un `create or replace`. Nessuna riga può però essere in
-- violazione, perché la definizione precedente era strettamente più restrittiva
-- di questa: ogni URL che passava prima passa anche adesso.
