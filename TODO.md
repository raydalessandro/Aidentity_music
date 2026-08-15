# AIDENTITY — Follow-up tecnici

Questo registro vive alla radice del repository per rendere visibili i lavori rimandati senza
ampliare indebitamente una pull request. Ogni voce va chiusa tramite branch e pull request dedicate.

Allineato dopo l'Onda 1, l'Onda 2 e le correzioni di sicurezza emerse dal primo contatto con un
database Supabase reale.

---

## 1. Prima del deploy

Queste non sono migliorie. Sono le cose che, se restano com'è, si manifestano **come difetti del
prodotto davanti a un utente reale** — e alcune non si vedono in CI, perché la CI gira su uno stack
locale che non ha gli stessi default del cloud.

| Voce | Perché prima del deploy | Criterio di chiusura |
|---|---|---|
| **Configurazione dell'ambiente ospitato** | L'applicazione senza variabili risponde 500 su ogni superficie: `readSiteUrl` e i client Supabase falliscono alla costruzione. Non è un difetto del codice, ma il primo caricamento della home lo sembra. | Su Vercel sono impostate `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e le sei `STRIPE_*` in modalità test. `NEXT_PUBLIC_SITE_URL` è il dominio vero, non un indirizzo di loopback. |
| **Limite di upload del progetto ospitato** | `supabase/config.toml` governa **solo** lo stack locale e la CI. Il progetto cloud ha un limite proprio, e finché resta sotto i 256 MiB una traccia grande viene rifiutata dallo Storage con un errore che non nasce dal nostro codice. | Il limite globale del progetto è ≥ `268435456` byte, cioè il `file_size_limit` del bucket `site-tracks`. Verificato caricando davvero una traccia oltre i 50 MiB. |
| **URL di reindirizzo dell'autenticazione** | Supabase valida `emailRedirectTo` contro una lista. Se il callback con la query `?next=…` non corrisponde, il magic link **funziona** ma riporta sempre alla home: l'utente entra e perde la destinazione, e sembra un difetto dell'applicazione. | Nella dashboard Supabase, `Site URL` è il dominio di produzione e la lista dei Redirect URLs contiene il callback. Verificato accedendo da `/login?next=/app/wizard` e atterrando sul wizard. |
| **Immagini senza testo alternativo** | `site_assets` non ha `alt`, né larghezza, né altezza. Ora che le immagini vengono rese davvero, ogni `<img>` di HOME e FEED esce senza alternativa testuale: è una barriera per chi usa uno screen reader, e axe la segnalerà sulla prima superficie pubblica con una foto. | Lo schema porta un testo alternativo per asset, il wizard lo raccoglie come campo obbligatorio per gli asset visibili, il renderer lo usa, e un test e2e con axe passa su una pagina che contiene almeno un'immagine reale. |
| **Retention: avvisi e purge non esistono** | La migrazione del billing valorizza correttamente `subscription_ended_at` e `purge_after = ended_at + 90 giorni`, ma **non c'è nulla che li esegua**. Un sito disdetto oggi accumula una data di purga che nessuno onora: gli avvisi a 60 e 80 giorni non partono e al giorno 90 gli oggetti Storage restano. È un impegno verso l'utente, non solo pulizia. | Esiste un'esecuzione periodica che manda gli avvisi a 60 e 80 giorni, e al giorno 90 elimina gli oggetti Storage, scrive `assets_purged_at` e conserva la riga come tombstone, con un test che dimostra l'idempotenza (eseguirla due volte non cancella due volte, e non tocca un sito ripubblicato nel frattempo). |
| **Registrazione del webhook Stripe** | Il webhook è l'unico scrittore di `sites.publication_status`. Se l'endpoint non è registrato sul dominio di produzione, un pagamento valido non pubblica niente e il sito resta in bozza senza che nulla lo segnali. | L'endpoint punta a `/api/stripe/webhook` sul dominio vero, il segreto di firma è impostato, e un pagamento con carta di test porta un sito da `draft` a `pending_review`. |

---

## 2. Debito dichiarato, non bloccante

| Voce | Criterio di chiusura |
|---|---|
| `parseRgb` legge uno sfondo trasparente come nero | In `e2e/shell.spec.ts` la funzione scarta il canale alfa: `rgba(0, 0, 0, 0)` diventa `[0, 0, 0]`, indistinguibile da un nero pieno. Finché ogni elemento misurato ha un `background` proprio il numero è giusto per caso. Chiuso quando il test risolve lo sfondo effettivo per ogni colore con alfa inferiore a 1, e una prova di mutazione rimuove il `background` da `.player-shell button` mostrando il test rosso sul contrasto reale. |
| Nessun test verifica che le tre famiglie di icone rendano diverse | `iconFamily` è coperta solo come enum in `lib/contract.ts`. Le tre regole vivono solo in `app/globals.css` e si potrebbero cancellare con la CI verde. Chiuso quando un test e2e confronta i valori calcolati di `.shell-icon` sotto `icons-line`, `icons-block` e `icons-stencil` e richiede rese distinte a due a due, con la mutazione che cancella le regole e mostra il rosso. |
| Allargare gli host embed oltre L0.7 §5 | Deciso da Ray: si farà, ma non ora. Oggi un artista che incolla il link condiviso dal telefono o uno short link se lo vede rifiutare. Chiuso quando l'insieme ammesso copre le forme che le piattaforme producono davvero **e** L0.7 §5 è emendata di conseguenza — §5 è normativa, allargare solo in migrazione la metterebbe in violazione. Serve un test che rifiuti comunque un host che *contiene* un dominio ammesso senza esserlo (`open.spotify.com.evil.test`). |
| `next dev` riscrive `AGENTS.md` | A ogni avvio Next aggiunge da sé un blocco `nextjs-agent-rules` e ne suggerisce il commit. Succede a ogni agente in locale e a ogni run del job e2e. `AGENTS.md` è un documento normativo: un tool che lo modifica da solo è un problema di governo. Chiuso quando o il blocco è accettato consapevolmente una volta, o la generazione è disattivata, con un controllo in CI che rende rosso un `AGENTS.md` modificato dal tool. |
| `site_slug_redirects` ha RLS senza policy | Segnalato dagli advisor Supabase come `rls_enabled_no_policy`. Oggi è fail-closed corretto perché nessuno cambia slug. Ma L0.7 §5 richiede un redirect prima che uno slug pubblicato possa cambiare: quando quella funzione servirà, `anon` dovrà risolverlo durante il routing. Chiuso insieme alla funzione di rinomina dello slug, con la policy e il test che dimostra che il redirect di un tenant non espone quello di un altro. |
| Chiavi esterne senza indice su `site_posts` | Gli advisor ne segnalano dodici; dieci sono irrilevanti o su tabelle fredde. I tre su `site_posts` (`visual_asset_id`, `track_id`, `cover_asset_id`) stanno sui LEFT JOIN che `public_posts` esegue **a ogni lettura pubblica di FEED**. Chiuso quando esistono gli indici e una misura mostra il piano di esecuzione prima e dopo su un sito con contenuti veri — non prima, perché su un database vuoto la misura non significa niente. |
| `service_role` ha tutti i privilegi su `public_sites` e `public_tracks` | Asimmetria nota rispetto alle otto proiezioni nuove, che hanno solo `select`. Deriva dal `grant all on all tables` di PR-0: per il catalogo una vista è una tabella. È una decisione deliberata di PR-0 e restringerla è una preoccupazione a sé. Chiuso quando le dieci proiezioni hanno la stessa forma, o quando la differenza è motivata per iscritto nel contratto. |

---

## 3. Chiuse

Registrate qui perché una voce chiusa senza traccia torna a essere riaperta da qualcuno che non
c'era.

| Voce | Chiusa da |
|---|---|
| Privilegi delle funzioni e preview link | `pr_0_contract_test.sql` rifiuta un token in chiaro (SQLSTATE 23514); `private_function_grants_test.sql` copre §6.8 alla lettera |
| RLS globale resistente alle nuove tabelle | test globale RLS + FORCE in `pr_0_contract_test.sql`, esteso dalle PR sui grant |
| Superfici pubbliche minime | #11 — otto proiezioni, consenso come filtro, 97 asserzioni con enumerazione esatta delle colonne |
| `service_role` non può inserire una traccia embed | #15 — tre `grant execute` sui validatori che i CHECK valutano. Il difetto era più largo del sospetto: erano rotti anche link, date, press e il salvataggio della configurazione da parte dell'owner |
| I media non arrivano ad `anon` | #18 — route `/api/media/`, redirect 302 verso URL firmato, bucket privati, TTL differenziato per immagini e tracce |
| I componenti EPK non sono collegati alla route EPK | #17 — più la separazione fra forma di render e forma di riga, che rende impossibile per tipo passare una riga di tabella al componente senza attraversare il filtro del consenso |
| `SiteReader` e il client di B non sono saldati | #16 — adattatore in `lib/site-reader/`, registrazione in `instrumentation.ts` |
| Lifecycle prenotazioni e quote | copertura di release, scadenza e downgrade fra la migrazione del billing e quella del wizard |
| Le due RPC di `public` erano invocabili senza login | #19 — verificato sul database reale dopo il deploy della migrazione |
| Nove relazioni con privilegi pieni per `anon` | #20 — `TRUNCATE` su `billing_events` era davvero eseguibile da `anon`, e RLS non lo intercetta. Verificato chiuso rileggendo `pg_class.relacl` sul progetto vero |

---

> Nessuna voce di questo file autorizza modifiche dirette a `main`: ogni intervento resta soggetto a
> branch, pull request e CI verde.
