-- AIDENTITY — bucket Storage per i file dei siti. **Contratto dati**: prima di questa
-- migrazione nessun bucket esisteva in nessuna migrazione del repo. `site_assets.storage_path`
-- e `site_tracks.storage_path` erano quindi puntatori verso un contenitore che non c'era.
--
-- Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md §5 (path privati fra i metadati
-- interni), §6.3 (`anon` legge soltanto proiezioni pubbliche; i path privati non vi entrano),
-- §6.9 (`service_role` non appare mai nel client).
--
-- ── Perché privati, e non un bucket pubblico ─────────────────────────────────────────────
--
-- Un bucket pubblico rende leggibile qualunque oggetto a chi ne indovina o ne intercetta il
-- path, **indipendentemente dallo stato del sito**. L'asset di un sito in bozza diventerebbe
-- così pubblico prima della pubblicazione, e l'asset di un sito depubblicato resterebbe
-- pubblico dopo: due cose che §6.3 esclude. La revoca, in un bucket pubblico, non esiste.
--
-- Con bucket privati l'unica via è la route server `/api/media/<kind>/<siteId>/<id>`, che
-- verifica `published`, verifica `purged_at is null`, verifica l'appartenenza al tenant e
-- solo allora risolve il path con `service_role` e firma un URL a vita breve (60 s) che
-- consuma essa stessa. Il path non lascia mai il server.
--
-- ── Perché due bucket ────────────────────────────────────────────────────────────────────
--
-- `site_assets.storage_path` e `site_tracks.storage_path` hanno due vincoli UNIQUE separati:
-- lo stesso path può esistere in entrambe le tabelle, e in un bucket unico sarebbe lo stesso
-- oggetto raggiunto da due righe che possono appartenere a tenant diversi. Due bucket
-- rendono la collisione impossibile per costruzione.

-- ---------------------------------------------------------------------------
-- 1. I bucket. `public = false` è la riga che porta tutto il peso di questo file.
--
-- `file_size_limit` è una cintura per oggetto, non la quota: la quota è `site_usage` e la
-- verifica atomica di §3.7 resta dove sta. Serve a impedire che un singolo caricamento
-- riempia da solo lo spazio di un piano MAX.
--
-- `allowed_mime_types` è un'allowlist, non un filtro cosmetico:
--   · niente `image/svg+xml`. Un SVG è un documento che può eseguire script, e la route lo
--     servirebbe **dalla nostra origine**: sarebbe XSS same-origin sul dominio della
--     piattaforma. La stessa esclusione è ripetuta lato server in `lib/media/media.ts`,
--     così una riga già presente non può essere restituita nemmeno se il bucket cambiasse;
--   · niente `video/*`. §5: «Il valore `video` è predisposto, ma in v1 le policy negano al
--     client l'inserimento di quell'asset». Un bucket che lo accettasse contraddirebbe la
--     riga che lo nega.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'site-assets', 'site-assets', false,
    33554432, -- 32 MiB per immagine
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
  ),
  (
    'site-tracks', 'site-tracks', false,
    268435456, -- 256 MiB per traccia
    array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/wav']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Policy su `storage.objects`: nessuna, ed è una decisione, non una dimenticanza.
--
-- `storage.objects` ha RLS attiva di default. Senza policy, `anon` e `authenticated` non
-- leggono e non scrivono nulla in questi bucket: il solo ruolo che vi accede è
-- `service_role`, che RLS non attraversa, e che vive esclusivamente dietro la route media.
-- È il default più stretto disponibile, e non richiede di scrivere una policy per negare.
--
-- Il caricamento dell'owner (INSERT dal wizard) è di un altro filone: quando arriverà, la
-- policy dovrà nominare il proprio tenant — il primo segmento del path — e non potrà essere
-- una `using (true)`. Questa migrazione non la anticipa: una policy di scrittura scritta
-- adesso, senza il codice che carica, sarebbe una superficie aperta e non provata.
--
-- `supabase/tests/database/media_storage_buckets_test.sql` verifica in pgTAP che i bucket
-- esistano, che siano privati, che RLS sia attiva su `storage.objects` e che nessuna policy
-- nomini `anon`.
-- ---------------------------------------------------------------------------
