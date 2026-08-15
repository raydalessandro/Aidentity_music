# C — Wizard · consegna locale revisionata

Base di revisione finale: `main` commit `a0e90c32da2478b3896a1242b9db9403115b3574` (include il merge EPK #17).
Stack previsto: `main` aggiornato → `feat/media-route` (dopo riallineamento/merge) → C.

Durante la revisione `feat/media-route` è avanzata fino a `86e4016fdb2249e52e69e1e633d4ce432e41b55f` (6 commit avanti, 3 dietro `main`). Su questa testa App, Database e Segreti sono verdi; il nuovo E2E media reale è rosso perché il processo Next rifiuta la configurazione Supabase pubblica esportata dal job (la route risponde 500 prima di raggiungere la logica media), ed è precisamente una delle ultime sistemazioni ancora in corso. Quindi C non assume quella testa come “verde definitivo”: va prima riallineata/chiusa media, poi rieseguita la CI, poi applicata C.

`f/one-sheet` sul remoto è ancora la branch vuota storica (0 commit avanti rispetto a `main`): non esiste oggi codice F da impilare dentro C.

> Questa versione sostituisce il primo ZIP. Non usare la consegna precedente.

## Scope implementato

- builder sotto `/app/wizard`: `app` è già riservato dal contratto e non collide con gli slug tenant;
- bootstrap deterministico per account senza siti, senza concedere INSERT client su `sites`;
- scelta slug per draft mai pubblicato; rename fermato dopo approvazione perché L0.7 richiede redirect;
- Identità → Tema → Contenuti → EPK;
- autosave `SiteConfigDraft` con debounce + coda seriale e revision guard;
- quattro preset A **e** modifica diretta dei sette token colore, font, icone, grana, superfici e section copy;
- preview tema in parità testata con `resolvePalette` del renderer D, inclusi temi custom;
- selezione hero solo da asset `visual`;
- “Aggiungi traccia” con upload/embed nello stesso passo;
- FEED: creazione/eliminazione `site_posts` visual o track, cover opzionale;
- CRUD EPK: contatti con consenso, DSP/social, press, live, metriche;
- preview owner autenticata con flush della config prima dell’apertura;
- preview temporanea con token 256 bit, solo SHA-256 nel DB, expiry, revoca, `noindex` e `no-referrer`;
- preview con anchor reali FEED/LISTEN/MERCH/EPK, così il dock non punta a sezioni inesistenti;
- filtro consenso esplicito al bordo C prima di rendere la preview condivisibile;
- test unitari per slug, parità tema, filtro consenso e contratto upload + smoke E2E auth;
- E2E reale C→Storage: reservation, upload owner sotto RLS, consume/usage e rifiuto di byte diversi con release quota;
- pgTAP C per reserve/release/expire/consume, quote, actor isolation e policy Storage.

## Upload: correzione dopo la revisione incrociata

Il primo ZIP assumeva che `feat/media-route` avrebbe esposto endpoint POST per gli upload. La branch reale non lo fa: implementa la **lettura** dei media e crea i bucket privati `site-assets` / `site-tracks`; dichiara esplicitamente che la scrittura owner appartiene al wizard.

C ora segue quel confine invece di inventare un’API media inesistente:

1. `POST /api/wizard/media/...` prenota atomicamente quota nel DB e restituisce un path deterministico;
2. i byte vanno **direttamente browser → Supabase Storage**, con sessione owner e RLS Storage;
3. la policy autorizza soltanto il bucket corretto, l’owner, una reservation `reserved` non scaduta, il path esatto `site/reservation/object` e gli stessi byte prenotati;
4. la SELECT Storage è temporanea e speculare all’INSERT, necessaria alla risposta dell’upload; sparisce appena la reservation non è più `reserved`;
5. il server verifica l’oggetto via Storage `info()` e poi consuma reservation + aggiorna usage + crea `site_assets`/`site_tracks` nello stesso commit DB;
6. su fallimento la reservation viene rilasciata; release/expire/consume condividono il lock `site_usage` di PR-0;
7. DB **prima**, cleanup Storage dopo: una release/expiry concorrente non può cancellare il file di una finalize che ha già vinto;
8. se la risposta di finalize si perde dopo un commit riuscito, il tentativo di release vede `consumed` e non elimina l’oggetto;
9. embed non crea reservation e non muove quote.

Le implementazioni privilegiate vivono in `private`; i wrapper pubblici sono ponti minimi service-role-only. C non concede a `service_role` USAGE sullo schema `private`, quindi non rompe il test esaustivo già presente in `private_function_grants_test.sql`.

### Dipendenza esplicita

Per usare davvero gli upload, `feat/media-route` deve essere mergiata **prima** di C, perché crea i due bucket Storage e il modulo `lib/media/media.ts` che C ora usa come sorgente runtime per nomi bucket e allowlist MIME.

La dipendenza è intenzionalmente resa visibile anche alla CI: `lib/wizard/media-parity.test.ts` importa i costanti media reali e legge la migrazione dei bucket. Se le ultime correzioni del filone media cambiano bucket, MIME o limiti senza riallineare C, `npm run check` diventa rosso invece di lasciare drift silenzioso.

## Correzioni emerse dalla review

1. **Collisione slug evitata**: `/wizard` → `/app/wizard`.
2. **Race autosave chiusa**: le scritture config sono serializzate.
3. **Parità tema corretta**: niente preset sostitutivo per config custom; test diretto contro D.
4. **Consenso preview blindato**: i contatti non consentiti vengono filtrati prima del render.
5. **FEED completato**: ora il builder crea davvero `site_posts`.
6. **Slug editabile**: ma non dopo approvazione, per non inventare il redirect richiesto da L0.7.
7. **Upload POST immaginario rimosso**: C possiede reserve/finalize/release; media-route resta lettura pubblica.
8. **Proxy file via Next rimosso**: i byte non attraversano la Function.
9. **Race Storage/DB chiusa**: stato DB prima di cleanup oggetto.
10. **SELECT RLS Storage aggiunta**: upload owner compatibile col `RETURNING` della Storage API.
11. **Tema realmente editabile**: oltre ai preset, tutti i sette token possono essere modificati.
12. **Preview contenuti meno “finta”**: FEED/LISTEN/MERCH mostrano l’inventario reale del draft e gli anchor del dock esistono.
13. **Parità C ↔ media resa eseguibile**: bucket e MIME non sono più una seconda copia; i limiti byte e i nomi nelle policy SQL sono confrontati con la migrazione media in un test dedicato.
14. **Ordinamento LISTEN coerente**: anche le tracce embed ricevono il prossimo `sort_order`, invece di accumularsi tutte sul default `0` mentre gli upload venivano accodati.
15. **Compatibilità EPK #17 verificata**: le preview C lavorano sulle righe owner `EpkContactRecord`; il confine render introdotto in `main` resta intatto e il consenso non viene inventato né portato nel markup.
16. **E2E Storage reale aggiunto**: sfrutta la `SERVICE_ROLE_KEY` effimera che le ultime correzioni media ora esportano in CI; prova una vera sessione owner, le policy `storage.objects`, il metadata size, consume e release.

## Due punti esterni a C da non nascondere

### B — ritorno dal magic link

C manda un non autenticato a `/login?next=/app/wizard`, ma il B attuale non propaga `next` dentro `emailRedirectTo`; quindi il magic link oggi rientra sul fallback del callback invece di tornare davvero al wizard. Va corretto in B, non dentro questa PR.

### Supabase locale — limite Storage globale

`feat/media-route` crea il bucket tracce con limite 256 MiB, ma `supabase/config.toml` corrente ha ancora `storage.file_size_limit = "50MiB"`. Il limite globale vince sul bucket: prima di testare tracce grandi in staging/local bisogna allineare esplicitamente quella configurazione. Non ho modificato il file condiviso da C.

## Nota su file audio grandi

Questa consegna usa l’upload standard diretto Supabase senza aggiungere dipendenze. È corretto e non attraversa Next, ma Supabase raccomanda il protocollo TUS/resumable per file sopra 6 MB o reti instabili. `tus-js-client`/Uppy non sono nell’allowlist dipendenze di L0.7, quindi non li ho introdotti di nascosto. Da provare esplicitamente in staging con una traccia grande; l’eventuale passaggio a TUS è una decisione separata di resilienza, non un bypass del contratto.

## Preview: confine con D/media

La preview C mostra tema/identità, inventario FEED/LISTEN/MERCH ed EPK reale del draft. Non duplica il renderer D né apre il media gate pubblico ai draft. Le immagini/audio privati caricati non vengono serviti dalla route pubblica di `feat/media-route` finché il sito non è `published`: la parità visiva finale del media privato va saldata al renderer, non ottenuta allentando quel gate.

## Applicazione e verifica

Dopo il merge/riallineamento di `feat/media-route`, crea/aggiorna `c/wizard` dalla nuova `main` e copia il contenuto dello ZIP nella root. Non applicare questa versione direttamente all'attuale `main` prima di media: l'import di `lib/media/media.ts` è un presidio voluto che rende esplicito l'ordine dello stack.

Verifiche effettuate in questo ambiente:

- nessuna scrittura al repository remoto;
- confronto file/scope con `main@a0e90c32`, EPK #17 già mergiata e l’ultima testa osservata `feat/media-route@86e4016f`;
- verifica del workflow CI corrente: App + Database (`db reset`, lint, pgTAP, diff) + E2E con Supabase locale + secret scan;
- presidio nuovo `media-parity.test.ts` per impedire drift fra le ultime correzioni media e C;
- parser TypeScript su tutti i `.ts/.tsx` della consegna;
- conteggio piano/assert pgTAP coerente;
- manifest SHA-256 rigenerato nello ZIP.

Non ho eseguito `npm check`, `supabase db reset` o pgTAP reali perché questo container non dispone del checkout con `node_modules` né di uno stack Postgres/Supabase avviabile. Questi restano il giudizio definitivo della CI.

## Stato CI e ordine di merge osservato nella revisione finale

- `main`: `a0e90c32da2478b3896a1242b9db9403115b3574`, EPK #17 incluso.
- `feat/media-route`: ultima testa osservata `86e4016fdb2249e52e69e1e633d4ce432e41b55f`; App/Database/Segreti verdi. Il nuovo E2E reale è rosso a monte della logica media: Next giudica non valida la configurazione Supabase pubblica del job e risponde 500. Inoltre la branch è ancora 3 commit dietro `main`. Serve chiusura del rosso + riallineamento + nuovo verde.
- `f/one-sheet`: nessuna implementazione pushata, 0 commit avanti.
- C: deve partire dalla `main` risultante **dopo** il merge media. La migrazione media `20260815190000` precede C `20260815203000`.

Le ultime correzioni di `feat/media-route` hanno già esteso il job E2E con `SUPABASE_SERVICE_ROLE_KEY` effimera e mascherata. C la usa soltanto nel test server-side E2E, mai nel client. Questo ha permesso di aggiungere ora la prova reale della saldatura upload, senza modificare ulteriormente il workflow.
