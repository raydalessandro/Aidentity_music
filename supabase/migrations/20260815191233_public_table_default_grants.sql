-- Chiusura dei privilegi di tabella ereditati dal bootstrap, gemella della
-- migrazione sulle funzioni: la' l'EXECUTE di default sulle RPC, qui i privilegi
-- di default sulle relazioni. Stessa causa, oggetti diversi.
--
-- IL DIFETTO
-- I progetti Supabase cloud non recenti portano dei default privileges per
-- `postgres` nello schema `public`:
--   alter default privileges for role postgres in schema public
--     grant all on tables to postgres, anon, authenticated, service_role;
-- Ogni relazione creata da `postgres` in `public` nasce quindi con TUTTI i
-- privilegi concessi ai tre ruoli della Data API. PR-0 lo neutralizza alla riga
-- 265 con `revoke all on all tables in schema public from anon,authenticated` --
-- ma quella riga vale una volta sola, sulle relazioni che esistevano in quel
-- momento. Tutto cio' che nasce dopo eredita di nuovo il default, e nessuna
-- migrazione successiva ha ripetuto la revoca.
--
-- L'ACL letta su `pg_class.relacl` del progetto reale:
--   billing_events  {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--                    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--   plans           {postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres,
--                    anon=r/postgres, authenticated=r/postgres}
-- `plans` e' del prima: `anon=r` e' il grant che abbiamo scritto noi. `arwdDxtm`
-- non e' SELECT, e' tutto: insert, select, update, delete, truncate, references,
-- trigger, maintain. (`m`, MAINTAIN, esiste da PostgreSQL 17; su 16 la stessa ACL
-- si legge `arwdDxt`. Il test non asserisce mai la stringa, solo i privilegi.)
--
-- LE RELAZIONI COLPITE SONO NOVE, E SONO ESATTAMENTE QUELLE NATE DOPO LA RIGA 265
--   public.billing_events                       (migrazione B)
--   public.public_assets, public_posts, public_links, public_press,
--   public_dates, public_metrics, public_contacts, public_site_meta
--                                               (migrazione delle proiezioni)
-- `site_slug_redirects` e le due viste di PR-0 sono pulite perche' nate prima
-- della revoca. Nessun'altra relazione e' stata creata dopo.
--
-- PERCHE' billing_events E' IL CASO SERIO, E PERCHE' NON BASTA DIRE "TANTO C'E' LA RLS"
-- `billing_events` ha RLS e FORCE RLS, e la sua unica policy e' una SELECT per il
-- platform admin: `anon` non legge, non inserisce, non aggiorna, non cancella --
-- la RLS lo ferma. Ma la RLS non copre TRUNCATE. Misurato su una ricostruzione
-- fedele all'ACL reale, con ruolo `anon`:
--   select count(*) from public.billing_events  ->  0 righe (RLS)
--   insert into public.billing_events ...       ->  42501, violazione di policy
--   truncate public.billing_events              ->  RIUSCITO
-- Il registro degli eventi billing e' anche la chiave di idempotenza di Stripe:
-- svuotarlo non cancella solo un audit, riapre la strada al riapplicarsi di ogni
-- evento gia' consumato. Oggi non e' una porta aperta -- PostgREST non emette mai
-- TRUNCATE, quindi il privilegio non e' raggiungibile dalla Data API, e `anon` non
-- ha CREATE su `public`, quindi nemmeno TRIGGER e REFERENCES sono sfruttabili. Ma
-- e' un privilegio distruttivo in mano al ruolo anonimo, e l'unico dell'elenco che
-- nessuna policy intercetta.
--
-- E LA MIGRAZIONE B AFFERMA IL FALSO
-- B scrive, alla riga 205: «billing_events e' append-only per costruzione: nemmeno
-- service_role riceve UPDATE o DELETE». Sul database vero `service_role` ha `w` e
-- `d`. L'affermazione e' vera sullo stack locale della CLI e falsa in produzione:
-- il modo peggiore di essere sbagliata, perche' la CI la conferma ogni volta. Da
-- qui in poi e' vera in entrambi, e i due test di B che la controllavano (`9` e
-- `10` di b_billing_lifecycle_test) diventano verdi anche in produzione.
--
-- LA FORMA: RIPORTARE ALL'ACL DICHIARATA, NON INVENTARNE UNA NUOVA
-- Ogni relazione torna esattamente ai privilegi che la migrazione che l'ha creata
-- dichiara, niente di piu' e niente di meno. Non c'e' una scelta di sicurezza da
-- prendere qui: la scelta era gia' scritta, e' l'eredita' che l'ha coperta.
--   * billing_events: B concede `select, insert` a service_role e `select` ad
--     authenticated (righe 207-208). `anon` non e' nominato: non riceve nulla.
--     `insert` a service_role resta anche se il webhook scrive attraverso
--     `apply_billing_event`, che e' SECURITY DEFINER e quindi non ne ha bisogno:
--     e' il contratto dichiarato da B, e restringerlo oltre sarebbe una decisione
--     nuova, non una correzione.
--   * le otto proiezioni: la migrazione delle proiezioni concede `select` ad
--     anon, authenticated e service_role (riga 149). Solo quello.
-- Nota su un'asimmetria che resta: `public_sites` e `public_tracks`, viste di
-- PR-0, danno a `service_role` tutti i privilegi, perche' la riga 267 concede
-- `all on all tables` e una vista e' una tabella per il catalogo. Non le tocco:
-- sono una decisione deliberata di PR-0 e cambiarla e' un'altra preoccupazione.
-- Sulle otto viste nuove seguo invece la dichiarazione della migrazione che le ha
-- create. In pratica la differenza e' inerte -- tutte e dieci le viste sono
-- `is_updatable = NO` e `is_insertable_into = NO`, e TRUNCATE su una vista e'
-- comunque un errore -- ma un privilegio inerte oggi e' un privilegio scritto per
-- errore, e la regola di questo repository e' che i privilegi si dichiarano.
--
-- PUBLIC nella lista delle revoche: una relazione, a differenza di una funzione,
-- non nasce con un grant a PUBLIC, e infatti nell'ACL non ce n'e' traccia. Lo
-- nomino lo stesso perche' la revoca sia esaustiva sul suo insieme di destinatari
-- e non dipenda dal ricordarsi quale default vale per quale tipo di oggetto.

-- ---------------------------------------------------------------------------
-- 1. billing_events: append-only per privilegio, come B dichiarava.
-- ---------------------------------------------------------------------------
revoke all on public.billing_events from public, anon, authenticated, service_role;

grant select, insert on public.billing_events to service_role;
grant select on public.billing_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le otto proiezioni pubbliche: sola lettura, come la migrazione dichiarava.
-- ---------------------------------------------------------------------------
revoke all on
  public.public_assets, public.public_posts, public.public_links, public.public_press,
  public.public_dates, public.public_metrics, public.public_contacts, public.public_site_meta
from public, anon, authenticated, service_role;

grant select on
  public.public_assets, public.public_posts, public.public_links, public.public_press,
  public.public_dates, public.public_metrics, public.public_contacts, public.public_site_meta
to anon, authenticated, service_role;
