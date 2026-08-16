# AIDENTITY — Follow-up tecnici

Questo registro vive alla radice del repository per rendere visibili i lavori rimandati senza
ampliare indebitamente una pull request. Ogni voce va chiusa tramite branch e pull request dedicate.

Allineato dopo l'Onda 1, l'Onda 2, le correzioni di sicurezza emerse dal primo contatto con un
database Supabase reale, e il primo deploy su Vercel — che ha portato a galla una classe di problemi
che nessun test poteva vedere: quelli del **divario fra il repository e la produzione**.

---

## 1. L'ambiente ospitato

Nata come «prima del deploy», questa sezione traccia ora il **divario fra il repository e la
produzione**. Non sono migliorie: sono le cose che, se restano com'è, si manifestano **come difetti
del prodotto davanti a un utente reale**, e quasi nessuna si vede in CI — la CI gira su uno stack
locale che non ha gli stessi default del cloud, e soprattutto **non tocca il progetto ospitato**.

> Stato al primo giro utente. Fatte: configurazione delle variabili, URL di reindirizzo
> dell'autenticazione, e l'allineamento delle migrazioni (vedi la prima riga). Aperte: la
> registrazione del webhook Stripe, il limite di upload, il testo alternativo delle immagini, i job
> di retention e l'avvio del primo amministratore.

| Voce | Perché conta | Criterio di chiusura |
|---|---|---|
| **Il merge deploya l'applicazione, non il database** | Scoperto misurando, non previsto: il progetto ospitato aveva **nove** migrazioni e il repository **dieci**. Mancava `20260815203000_c_wizard_upload_lifecycle`, mergiata dopo l'ultima applicazione manuale — quindi in produzione le cinque RPC `wizard_*` **non esistevano** e ogni upload dal wizard sarebbe fallito, con il resto dell'applicazione perfettamente funzionante. Vercel ri-deploya al push; il database no, e nulla lo segnala. La migrazione è stata applicata a mano il 16/08 e verificata rileggendo il catalogo (cinque funzioni con ACL `postgres=X/postgres, service_role=X/postgres`, quattro policy Storage per `authenticated`). **Il difetto di processo resta aperto.** | Il deploy applica le migrazioni, oppure esiste un controllo che diventa rosso quando lo schema ospitato è indietro rispetto al repository. Un confronto per numero di righe in `supabase_migrations.schema_migrations` non basta: i timestamp registrati sul cloud sono quelli di applicazione, non i nomi dei file, quindi il confronto va fatto per contenuto o per oggetti attesi. |
| **Nessun modo di creare il primo amministratore** | `public.platform_admins` è popolata **soltanto** da `supabase/seed.sql`, che gira sullo stack locale e in CI e mai sul progetto ospitato. In produzione la tabella è vuota, quindi `/app/moderation` risponde 404 a chiunque, incluso il titolare, e nessun sito può essere approvato. L'ordine è vincolante: `platform_admins.user_id` ha una FK verso `profiles(id)`, quindi il primo accesso (che crea il profilo tramite il trigger `on_auth_user_created`) deve precedere l'inserimento. | Esiste un modo documentato e ripetibile di nominare il primo amministratore che non sia una `insert` a mano ricordata a memoria — e che non inchiodi un UUID di utente reale dentro una migrazione versionata, legando lo schema a un ambiente. |
| **Configurazione dell'ambiente ospitato** | L'applicazione senza variabili risponde 500 su ogni superficie: `readSiteUrl` e i client Supabase falliscono alla costruzione. Non è un difetto del codice, ma il primo caricamento della home lo sembra. | Su Vercel sono impostate `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e le **otto** `STRIPE_*` in modalità test: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e le sei `STRIPE_PRICE_{BASE,PRO,MAX}_{MONTH,YEAR}` elencate in `.env.example`. (Questa riga diceva «sei»: erano solo quelle dei prezzi, e mancavano all'appello le due che contano di più.) `NEXT_PUBLIC_SITE_URL` è il dominio vero, non un indirizzo di loopback, e `STRIPE_SECRET_KEY` deve iniziare per `sk_test_` — `createStripeClient` rifiuta qualunque altra forma, per scelta di v1. |
| **Limite di upload del progetto ospitato** | `supabase/config.toml` governa **solo** lo stack locale e la CI. Il progetto cloud ha un limite proprio, e finché resta sotto i 256 MiB una traccia grande viene rifiutata dallo Storage con un errore che non nasce dal nostro codice. | Il limite globale del progetto è ≥ `268435456` byte, cioè il `file_size_limit` del bucket `site-tracks`. Verificato caricando davvero una traccia oltre i 50 MiB. |
| **URL di reindirizzo dell'autenticazione** | Supabase valida `emailRedirectTo` contro una lista. Se il callback con la query `?next=…` non corrisponde, il magic link **funziona** ma riporta sempre alla home: l'utente entra e perde la destinazione, e sembra un difetto dell'applicazione. | Nella dashboard Supabase, `Site URL` è il dominio di produzione e la lista dei Redirect URLs contiene il callback. Verificato accedendo da `/login?next=/app/wizard` e atterrando sul wizard. |
| **Immagini senza testo alternativo** | `site_assets` non ha `alt`, né larghezza, né altezza. Ora che le immagini vengono rese davvero, ogni `<img>` di HOME e FEED esce senza alternativa testuale: è una barriera per chi usa uno screen reader, e axe la segnalerà sulla prima superficie pubblica con una foto. | Lo schema porta un testo alternativo per asset, il wizard lo raccoglie come campo obbligatorio per gli asset visibili, il renderer lo usa, e un test e2e con axe passa su una pagina che contiene almeno un'immagine reale. |
| **Retention: avvisi e purge non esistono** | La migrazione del billing valorizza correttamente `subscription_ended_at` e `purge_after = ended_at + 90 giorni`, ma **non c'è nulla che li esegua**. Un sito disdetto oggi accumula una data di purga che nessuno onora: gli avvisi a 60 e 80 giorni non partono e al giorno 90 gli oggetti Storage restano. È un impegno verso l'utente, non solo pulizia. | Esiste un'esecuzione periodica che manda gli avvisi a 60 e 80 giorni, e al giorno 90 elimina gli oggetti Storage, scrive `assets_purged_at` e conserva la riga come tombstone, con un test che dimostra l'idempotenza (eseguirla due volte non cancella due volte, e non tocca un sito ripubblicato nel frattempo). |
| **Registrazione del webhook Stripe** | Il webhook è l'unico scrittore di `sites.publication_status`. Se l'endpoint non è registrato sul dominio di produzione, un pagamento valido non pubblica niente e il sito resta in bozza senza che nulla lo segnali. **La trappola non è la registrazione, è la scelta degli eventi**: `normalize.ts` accetta soltanto i cinque `customer.subscription.{created,updated,deleted,paused,resumed}` e **ignora** `checkout.session.completed`, che è la scelta istintiva in dashboard. Selezionando solo quello, Stripe mostra consegne riuscite (200 `ignored`) e nessun sito viene mai pubblicato: un guasto che si presenta come funzionamento. | L'endpoint punta a `/api/stripe/webhook` sul dominio vero — verificato: un `GET` risponde `405` con `x-matched-path: /api/stripe/webhook` — sono selezionati i **cinque** `customer.subscription.*`, il segreto di firma è in `STRIPE_WEBHOOK_SECRET` **e si è ri-deployato dopo averlo impostato** (su Vercel una variabile cambiata non raggiunge le funzioni già distribuite), e un pagamento con carta di test `4242 4242 4242 4242` porta un sito da `draft` a `pending_review`. |

---

## 1-bis. Perché sembri un prodotto

Il funnel esisteva per intero — login → wizard → sito → preview → `/slug` con le sue superfici — ma
non aveva una porta, e la porta di casa dell'artista non navigava. I punti sono stati fatti uno alla
volta, con controllo visuale fra l'uno e l'altro. Il quarto non era previsto: è emerso preparando il
terzo. Design essenziale per scelta: la rifinitura viene dopo, in branch separate.

| # | Voce | Criterio di chiusura | Stato |
|---|---|---|---|
| 1 | **Il sito pubblicato smette di comportarsi da anteprima** | Il dock di `SiteShell` porta alle rotte (`/slug/feed`) e non alle ancore; una superficie spenta non compare invece di comparire con `aria-disabled`, che non impedisce la navigazione; la topbar non dice `PREVIEW` su un sito vero; il player segnaposto spento non affianca il `PlayerBar` reale. Dock e `SurfaceNav` leggono lo stesso `surfaceHref`. | **chiusa da #26** |
| 2 | **La home ha una porta** | La radice era il banco del filone A: quattro artisti finti, intestazione `FILONE A / GUSCIO THEMABLE`, e **zero** `href` in tutta la pagina — `/login` raggiungibile solo digitandolo. Chiusa con una landing che promette qualcosa e porta a `/login?next=/app/wizard`, showroom sotto come dimostrazione. | **chiusa da #27** |
| 3 | **Il webhook Stripe è registrato** | Vedi §1. Resta di Ray: è configurazione in dashboard, non codice. | **aperta** |
| 4 | **Un sito può uscire da `pending_review`** | Non era previsto: è emerso preparando il punto 3. Dopo un pagamento valido un sito nuovo va in `pending_review`, e nell'applicazione non esisteva nulla che chiamasse `public.moderate_site` — quella RPC viveva solo nel database. Conseguenza: nessun sito poteva diventare `published`, quindi `/[slug]` rispondeva 404 a chiunque, e anche con Stripe perfetto non sarebbe cambiato niente. | **chiusa da #28** — `/app/moderation`, sessione utente e mai `service_role`, 404 e non 403 per chi non è amministratore, e il rifiuto del database riportato come rifiuto |

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
| Nessun test dimostra che `error.code` sia lo SQLSTATE | Quattro punti del codice traducono un errore del database leggendo `error.code` come SQLSTATE: `app/api/wizard/media/track/route.ts:108` (`23514`), `app/api/wizard/slug/route.ts:48` (`23505`, `23514`), `lib/wizard/upload-server.ts:149`, e la superficie di moderazione (`42501`, `23514`). È un'assunzione su come `supabase-js` propaga un'eccezione sollevata **dentro** una funzione, e **nessuna spec e2e esercita quei rami**: verificato leggendo le spec, non dedotto. Nella moderazione il modo di sbagliare è mitigato — un codice sconosciuto non produce mai un successo — ma altrove no. Chiuso quando almeno un test contro un database vero solleva l'eccezione e verifica il codice ricevuto dal client, così che l'assunzione smetta di essere condivisa da quattro punti e dimostrata da zero. |
| `service_role` ha tutti i privilegi su `public_sites` e `public_tracks` | Asimmetria nota rispetto alle otto proiezioni nuove, che hanno solo `select`. Deriva dal `grant all on all tables` di PR-0: per il catalogo una vista è una tabella. È una decisione deliberata di PR-0 e restringerla è una preoccupazione a sé. Chiuso quando le dieci proiezioni hanno la stessa forma, o quando la differenza è motivata per iscritto nel contratto. |
| La difesa sui byte dell'upload vive a un livello solo | La policy Storage di C confrontava `metadata->>'size'` con i byte prenotati. Misurato: non poteva funzionare, perché Supabase valuta la RLS in `prepareUpload`, **prima** che i byte arrivino, e in quel momento `metadata` contiene solo `mimetype` e `contentLength`; `size` nasce dopo, quando `completeUpload` scrive la riga con `asSuperUser()`, che la RLS non attraversa. La condizione negava ogni upload di ogni utente ed è stata rimossa. Oggi il confronto vive solo in `lib/wizard/upload-server.ts` (`assertStoredSize`, via `info()`), che però vede la dimensione **realmente memorizzata**: non è un buco, è difesa in profondità perduta. Da studiare dopo il primo deploy. Chiuso quando si stabilisce se il confronto sia riottenibile a livello di Storage sapendo che alla valutazione della RLS esiste il solo `contentLength`, che è **dichiarato dal client** e quindi non è una garanzia — e se la risposta è no, quando la decisione è scritta accanto alla policy come scelta definitiva invece che come rimozione temporanea. |
| Il banco 133 provava un invariante nel posto sbagliato | `e2e/wizard-upload.spec.ts` pretendeva che una dimensione diversa dalla prenotazione fosse **negata dalla policy Storage**. Con la policy precedente sarebbe passato, ma perché *tutto* veniva negato: un verde che non dimostrava niente. Riscritto per misurare dove la garanzia vive davvero — l'oggetto entra, la finalizzazione lo rifiuta con `stored-object-mismatch`, la prenotazione non viene consumata e la quota torna libera. Chiuso quando gli altri banchi della suite upload sono riletti con la stessa domanda, «passerebbe anche se la cosa che verifica fosse rotta?», e ognuno ha o una prova di mutazione o una ragione scritta per cui non serve. |

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
| Il dock del sito pubblicato non navigava | #26 — `ShellDestination`, e la richiesta che D aveva lasciato per iscritto in `surface-content.tsx` finalmente raccolta |
| La radice non aveva una porta | #27 — landing con ingresso a `/login?next=/app/wizard`, contrasti misurati, showroom sotto |
| Un sito non poteva uscire da `pending_review` | #28 — `/app/moderation`, moderazione dalla sessione dell'utente e mai da `service_role` |
| Le RPC del wizard mancavano in produzione | Migrazione `20260815203000` applicata a mano al progetto ospitato il 16/08 e verificata sul catalogo. **La causa — il deploy non applica le migrazioni — resta aperta in §1** |

---

> Nessuna voce di questo file autorizza modifiche dirette a `main`: ogni intervento resta soggetto a
> branch, pull request e CI verde.
