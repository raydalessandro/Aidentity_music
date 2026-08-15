-- Correzione di un difetto di PR-0 (autorizzata da Ray, limitata a questo difetto).
--
-- IL DIFETTO
-- Cinque tabelle di contenuto hanno un CHECK che invoca una funzione di `private`:
--   private.is_https_url            -> site_links.url, site_press.url, site_dates.ticket_url
--   private.valid_embed_url         -> site_tracks (ramo embed)
--   private.valid_site_config_draft -> site_config.config
-- Un vincolo CHECK e' valutato con i privilegi di chi scrive la riga, non con
-- quelli di chi ha creato la tabella. PR-0 revoca EXECUTE su tutte le funzioni di
-- `private` da PUBLIC, `anon` e `authenticated` e poi ne riconcede tre sole, le
-- tre usate dalle policy RLS. I tre validatori qui sopra non sono fra quelle, e
-- `service_role` non riceve nulla perche' la revoca a PUBLIC gli toglie anche il
-- privilegio di default. Risultato: nessun ruolo reale riesce a scrivere quelle
-- tabelle. L'owner non puo' aggiungere un link, una data, una citazione stampa ne'
-- salvare la propria configurazione; il backend non puo' inserire una traccia, ne'
-- embed ne' upload -- il CHECK e' una sola espressione e il privilegio e'
-- verificato quando l'espressione viene inizializzata, prima che il ramo `upload`
-- possa scartare la chiamata.
--
-- NON E' LO SCHEMA, E' LA FUNZIONE
-- La diagnosi iniziale sospettava la mancanza di USAGE sullo schema `private`.
-- Non e' quella: l'errore osservato e' `permission denied for function`, non
-- `for schema`. USAGE serve a risolvere un nome, e le espressioni di un CHECK o
-- di una policy sono gia' risolte quando il vincolo viene creato; a runtime resta
-- da verificare il solo EXECUTE. La prova sta gia' in questo repository:
-- `private.contact_is_public` e' invocata dalla vista `public_contacts` con
-- EXECUTE concesso ad `anon` e senza alcun USAGE, e i test delle proiezioni sono
-- verdi.
--
-- PERCHE' QUESTA E' LA CORREZIONE PIU' STRETTA, NON LA PIU' COMODA
-- Concedere USAGE sullo schema avrebbe aperto `private` alla risoluzione dei nomi
-- per i ruoli del client: ogni funzione con EXECUTE residuo sarebbe diventata
-- invocabile per nome, cioe' una superficie. Senza USAGE resta vero che
--   select private.valid_embed_url(...)  ->  42501 permission denied for schema private
-- anche per il ruolo a cui EXECUTE e' appena stato concesso. L0.7 §6.7 e §6.8
-- restano intatte: le funzioni-trigger (set_updated_at, create_site_dependents,
-- handle_new_user), private.reserve_upload, site_is_publishable, site_over_quota,
-- site_content_publishable e valid_site_config_complete non ricevono nulla qui e
-- restano revocate.
--
-- I GRANT SONO PER RUOLO, NON PER FUNZIONE
-- Ogni validatore va al solo ruolo che PR-0 autorizza a scrivere la tabella che
-- quel validatore vincola. `authenticated` ha INSERT/UPDATE/DELETE su site_config,
-- site_links, site_press e site_dates, e non su site_tracks: non riceve
-- valid_embed_url, e continuera' a vedersi rifiutare una traccia con
-- `permission denied for table site_tracks`. `anon` non scrive nulla e non riceve
-- nulla. Se un domani il client dovesse poter aggiungere una traccia embed da se',
-- la decisione da prendere e' un grant di tabella in PR-0, non un grant di
-- funzione qui: e' un'altra preoccupazione e va discussa a parte.

grant execute on function private.is_https_url(text)
  to authenticated, service_role;

grant execute on function private.valid_site_config_draft(jsonb)
  to authenticated, service_role;

grant execute on function private.valid_embed_url(public.embed_provider, text)
  to service_role;
