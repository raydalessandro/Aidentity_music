# PR-0 — Disegno database verificato

Stato: **pronto per essere tradotto in migrazione, non ancora applicato** · 15/08/2026
Fonte normativa: `L0.7-AIDENTITY-contratto-canonico.md`.

Questo documento conserva la revisione tecnica svolta prima del DDL. Non sostituisce la
migrazione: nomi, vincoli e test diventano effettivi soltanto nel file creato dalla Supabase CLI
e verificato da reset completo + pgTAP.

## 1. Relazioni

### Nucleo e ciclo vita

- `profiles`: PK/FK `auth.users`, nome pubblico, customer Stripe e timestamp.
- `plans`: codice, prezzi, limiti foto/upload/byte; le tre righe canoniche entrano in migrazione.
- `sites`: owner, slug, pubblicazione, approvazione, hold di moderazione accoppiato a reason,
  retention e timestamp; vincolo univoco `(id, owner_id)`.
- `site_slug_redirects`: vecchio slug e sito; il cambio di uno slug già pubblicato registra prima
  il redirect.
- `site_subscriptions`: una riga server-only per sito; nasce BASE/`not_started` con intervallo e ID
  Stripe nulli, poi registra piano/intervallo, ID Stripe e stato billing effettivi.
- `site_usage`: contatori effettivi e prenotati per byte, foto e tracce upload; mai scrivibile dal
  client.
- `site_upload_reservations`: prenotazioni `asset | track_upload`, stato
  `reserved | consumed | released | expired`, scadenza e FK tenant-consistente.
- `site_config`: JSON draft v1 validato più `hero_asset_id` relazionale nullable; una riga per sito,
  senza copy fittizio. Il gate di pubblicazione richiede la forma completa e un hero valido.
- `platform_admins`, `moderation_events` append-only e `site_preview_links` con solo hash del token.

### Contenuti

`site_assets`, `site_tracks`, `site_posts`, `site_links`, `site_press`, `site_dates`,
`site_metrics` e `site_contacts` hanno PK UUID, `site_id`, `sort_order`, timestamp e
`UNIQUE (site_id, id)`.
Ogni riferimento fra contenuti usa una FK composita che include `site_id`.

- La CHECK di `site_tracks` ammette soltanto upload completo oppure embed completo, mai un ibrido.
- Una CHECK basata su validator SQL immutabile rifiuta un URL embed il cui hostname non corrisponde
  al provider; il renderer non crea iframe da domini HTTPS arbitrari.
- La CHECK di `site_posts` ammette soltanto visual+asset oppure track+traccia e cover opzionale.
- Asset e file upload richiedono byte positivi. `video` esiste nel vocabolario ma il client v1 non
  può prenotarlo né inserirlo.
- Asset e tracce upload hanno `purged_at` nullable: il purge elimina l'oggetto Storage ma conserva
  riga, testo e metadati. Soltanto file non purgati contano e possono entrare in una pubblicazione.
- Il consenso del contatto è una coppia obbligatoria timestamp/autore; nome, ruolo ed email sono
  obbligatori.

## 2. Quote atomiche

Le operazioni di quota bloccano con `FOR UPDATE` la riga `site_usage` e il piano effettivo:

1. `reserve_upload` scade opportunisticamente le prenotazioni vecchie, somma uso effettivo e
   prenotato e crea una prenotazione soltanto se tutti i limiti reggono;
2. `consume_upload_reservation` crea/lega il contenuto e sposta i contatori prenotati in effettivi
   nella stessa transazione;
3. `release_upload_reservation` e `expire_upload_reservations` restituiscono capacità in modo
   idempotente;
4. la cancellazione del file decrementa l'uso effettivo; più post sullo stesso asset non cambiano
   i contatori;
5. embed e relativi post sono neutrali rispetto a byte e slot.

Un downgrade oltre quota non cancella righe: impedisce nuove prenotazioni e porta un sito
`published` a `draft` finché non rientra nei limiti.

## 3. Privilegi e RLS

- Revoca iniziale dei privilegi impliciti; grant e default privileges espliciti.
- RLS attiva e forzata su ogni tabella pubblica; difesa equivalente sulle tabelle private.
- `anon` legge soltanto viste `security_invoker` delle righe pubblicate. Riceve sulle tabelle base
  soltanto le colonne pubbliche necessarie alle viste: mai owner, consenso, billing, usage, hash,
  path o byte interni.
- `authenticated` usa le stesse proiezioni per siti altrui e le policy owner per i propri dati.
  Non può scrivere owner, stato, lifecycle, Stripe, usage, asset upload o tracce upload.
- Il platform admin ha lettura globale, ma nessun UPDATE generale: approvazione e sospensione
  passano da una sola operazione auditata.
- Il recupero billing controlla il hold di moderazione e non può rimuoverlo; una nuova subscription
  non aggira una sospensione amministrativa.
- Le funzioni privilegiate usano nomi qualificati, `SECURITY DEFINER SET search_path = ''` e
  revoche EXECUTE a `PUBLIC`; le funzioni trigger non sono RPC.
- Le funzioni chiamabili dal prodotto hanno wrapper pubblici minimi, controlli `auth.uid()` e grant
  esatto; lo schema `private` non viene esposto alla Data API.
- L'owner non può cancellare direttamente un intero sito in v1. Retention e purge restano azioni
  server-only.

## 4. Test pgTAP obbligatori

1. Oggetti, enum, valori dei piani, RLS/FORCE RLS, grant, CHECK, FK e indici.
2. Nessun token in chiaro; nessun EXECUTE pubblico sulle funzioni privilegiate o trigger.
3. `anon` vede solo il fixture pubblicato e solo colonne sicure; owner A non legge/scrive B.
4. FK incrociate fra tenant falliscono anche con ruolo privilegiato.
5. Il client non modifica pubblicazione, billing, usage, asset/video o tracce upload.
6. Config draft con identità nulla è salvabile, ma review/pubblicazione falliscono finché config,
   hero e file referenziati non sono completi e disponibili.
7. Moderazione non-admin fallisce; approve/suspend legali producono esattamente un evento;
   UPDATE/DELETE dell'audit falliscono.
8. Limiti esatti e `+1` falliscono; prenotazioni multiple si sommano; consume/release/expiry/delete
   aggiornano i contatori; embed illimitati sono neutrali; downgrade conserva le righe e torna draft.

Il pgTAP in una sola sessione non dimostra una vera gara simultanea. I row lock e l'atomicità SQL
sono l'invariante; un test concorrente a due connessioni resta un'integrazione separata.

## 5. Sequenza di realizzazione

Quando la CLI è disponibile:

1. leggere `supabase --help`, `supabase init --help` e inizializzare il progetto se necessario;
2. leggere `supabase migration new --help` ed eseguire
   `supabase migration new pr_0_database_contract`;
3. modificare esclusivamente il percorso timestampato emesso dalla CLI;
4. aggiungere `supabase/seed.sql` e i test sotto `supabase/tests/database/`;
5. eseguire `supabase db reset`, `supabase db lint --fail-on error` e `supabase test db` sullo
   stack locale pulito.

Non si crea a mano un nome di migrazione e non si applica nulla ai database ospitati usati come
sorgenti.
