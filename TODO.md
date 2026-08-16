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
| **Nessun modo di creare il primo amministratore** | `public.platform_admins` è popolata **soltanto** da `supabase/seed.sql`, che gira sullo stack locale e in CI e mai sul progetto ospitato. In produzione la tabella è vuota — **misurato il 16/08: `select count(*) from public.platform_admins` restituisce 0** — quindi `/app/moderation` risponde 404 a chiunque, incluso il titolare, e nessun sito può essere approvato. L'ordine è vincolante: `platform_admins.user_id` ha una FK verso `profiles(id)`, quindi il primo accesso (che crea il profilo tramite il trigger `on_auth_user_created`) deve precedere l'inserimento. | Esiste un modo documentato e ripetibile di nominare il primo amministratore che non sia una `insert` a mano ricordata a memoria — e che non inchiodi un UUID di utente reale dentro una migrazione versionata, legando lo schema a un ambiente. |
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

## 1-ter. La fase artista: la pagina come casa, non come modulo

Decisa da Ray dopo la #34, da costruire **a template definitivo** — non prima. L'obiettivo non è
aggiungere schermate: è che l'artista entri, riconosca il posto, e cambi le sue cose come cambia un
profilo social, senza sapere che sta compilando una configurazione.

**La direzione di prodotto**, nelle parole di Ray: si parte da **un template unico che cambia faccia**
con colori, nomi, font e SVG — tutte cose che scalano da sole perché sono già dati, non codice. Poi,
progressivamente, **le immagini dell'artista diventano centrali e strutturali** nell'interfaccia, così
la personalizzazione se la creano da soli invece di sceglierla da un elenco. Un'eventuale generazione
di immagini via IA è un modulo che si appoggia sopra in un secondo momento, puntuale: non è un
presupposto di niente in questa fase.

**Quello che NON va rifatto** — verificato leggendo schema e rotte, non dedotto:

- Le scritture dell'artista sono già multi-tenant e già permesse. `site_posts`, `site_links`,
  `site_press`, `site_dates`, `site_metrics`, `site_contacts` hanno policy `for all` con
  `with check(private.is_site_owner(site_id))`, e il wizard le scrive **già dal browser**. Una UI
  in stile social sopra queste tabelle è interfaccia, non backend.
- L'upload ha già il ciclo completo con prenotazione della quota (`/api/wizard/media/asset`,
  `/api/wizard/media/track`): i byte vanno diretti allo Storage privato senza attraversare Next.
- `profiles` ha `select` e `update` propri: l'area profilo è già permessa dalla RLS.
- L'autofatturazione esiste già come rotte di checkout e portale Stripe.

| Voce | Perché conta | Criterio di chiusura |
|---|---|---|
| **Non si può cancellare nulla di media** | `site_assets` e `site_tracks` hanno per il proprietario **soltanto `for select`** (nessun insert, update o delete dal client), e **nessuna rotta scrive `purged_at`**: la colonna esiste ma nell'applicazione compare solo come filtro `is("purged_at", null)`. In una interfaccia in stile social «elimina la foto» è la seconda cosa che chiunque prova. Non è un bottone mancante: cancellare deve **restituire la quota** in `site_usage` e purgare l'oggetto su Storage, altrimenti un artista che carica e cancella dieci volte esaurisce il piano senza avere nulla online. | Esiste una strada di cancellazione che scrive `purged_at`, libera i byte e i contatori in `site_usage` e rimuove l'oggetto dallo Storage, con un test che dimostra l'idempotenza (cancellare due volte non scala la quota due volte) e uno che dimostra che un proprietario non può purgare l'asset di un altro tenant. |
| **Non si può riordinare né rinominare un media** | Stessa causa: le due tabelle sono in sola lettura per il proprietario. I post si riordinano (`sort_order` su tabella `for all`), le tracce e gli asset no. In un'interfaccia dove le immagini diventano strutturali, l'ordine **è** il layout. | Il proprietario può cambiare `sort_order` e i campi descrittivi dei propri asset e tracce, con la stessa disciplina della cancellazione: o via policy ristretta alle colonne sicure, o via rotta. Un test deve dimostrare che `storage_path`, `byte_size` e `purged_at` restano fuori dalla portata del client. |
| **L'artista non può pubblicarsi da solo** | `sites.publication_status` si muove da due sole strade: `public.moderate_site` (che rifiuta chi non è platform admin) e `public.apply_billing_event` (eseguibile dal solo `service_role`, dal webhook Stripe). È una scelta deliberata di PR-0, ma se la pagina diventa il posto dove l'artista vive, lui vedrà «in attesa» e non avrà **nessun** comando: è il tipo di vicolo cieco che si scopre col primo utente vero. | La decisione è presa e scritta: o l'approvazione umana resta e l'interfaccia la racconta onestamente (stato, cosa manca, quanto ci vuole), o esiste una strada di autopubblicazione con le sue condizioni verificabili — e in quel caso L0.7 va emendata, perché oggi la moderazione precede la pubblicazione per contratto. |
| **Dove vive l'editor** | `/[slug]` è sigillata di proposito: legge dalle proiezioni `public_*` e `app/[slug]/composition.test.ts` impedisce a quella cartella di raggiungere il client Supabase. Montare lì una modalità di modifica per il proprietario significa insegnare alla rotta pubblica cosa sia una sessione, cioè rinunciare all'isolamento che la rende veloce e verificabile. L'alternativa — l'editor resta in `/app/…` ma **smette di sembrare un modulo e diventa la loro pagina**, stesso template con le affordance di modifica sopra — è quella che il confine template già permette. | La scelta è scritta prima di aprire la prima branch di questa fase, con la ragione. Se vince l'editor dentro `/app/…`, `interactive={false}` (oggi senza chiamanti, §2) torna ad avere uno scopo ed esce dal debito. |
| **Il merch oggi è una superficie, non un commercio** | Esistono il toggle della superficie `merch` e il tipo di asset `merch` (immagini di render). Non esiste **nessuna** tabella di prodotti, prezzi, disponibilità o ordini. Chiamare «merch» ciò che c'è oggi è corretto solo finché significa «una pagina con delle immagini». | Blocco a sé, dopo questa fase: quando il commercio servirà davvero, nasce con il proprio schema, la propria quota e il proprio rapporto con Stripe — che oggi conosce solo abbonamenti al prodotto, non vendite dell'artista. |

---

## 1-quater. Il template, pagina per pagina

La base del template è buona, ma sopra non c'è ancora niente. Metodo deciso da Ray: **una
branch per pagina, ognuna con la sua preview**, guardata su un telefono vero prima di
passare alla successiva. Insieme solo quando due voci si tengono davvero. Il costruttore si
sistema **dopo**: con il template finito diventa molto più semplice.

**La radice comune delle prime tre voci**, verificata leggendo le due anteprime: sia
`app/preview/[token]/page.tsx` (link 24h) sia `app/app/wizard/preview/[siteId]/page.tsx`
rendono `SiteTemplateHome` **senza `destination`** — cioè in modalità anteprima, dove il dock
punta ad ancore — e poi **impilano sotto** l'inventario della bozza e l'EPK nella stessa
pagina. Il sito pubblicato invece ha rotte vere (`/slug/feed`, `/slug/listen`, …) e il dock ci
porta. Quindi non sono tre difetti del template: è un'anteprima che non assomiglia al sito.

| # | Voce | Criterio di chiusura |
|---|---|---|
| 1 | **Le anteprime sono una pagina sola; il sito no** | Nelle parole di Ray: «il template ancora scorre su tutte le pagine e non le divide come da menu: cliccando scorre e ti manda dove c'è quella sezione, invece di essere sezioni a sé». Chiusa quando le anteprime rendono le superfici attraverso il `Surface` del template, con una navigazione che cambia superficie invece di scorrere — e quando un banco dimostra che l'anteprima e il pubblicato mostrano **le stesse superfici**, non due strutture diverse. `ShellDestination` distingue già i due mondi: il pezzo che manca è una destinazione d'anteprima che navighi. |
| 2 | **La HOME apre ogni vista dell'anteprima** | «La home è fissa all'inizio di tutte le pagine e dovrebbe stare solo nel feed» (parole di Ray, da riprecisare quando ci arriviamo: HOME come superficie fra le altre, non intestazione fissa di tutto). Stessa causa della voce 1. Chiusa quando la HOME è una superficie raggiungibile, non il cappello di ogni schermata. |
| 3 | **Nessun player nelle anteprime** | Le tracce caricate compaiono nel link 24h ma non si ascoltano: il player vero (`PlayerBar` + `PlayerProvider`) vive in `app/[slug]/layout.tsx`, quindi esiste **solo sul sito pubblicato**. Ray propone di prendere il player da `raydalessandro/spotimai`. Attenzione al confine, che non è CSS: nel link 24h i media non hanno una strada autorizzata — `/api/wizard/preview-asset/[assetId]` richiede la sessione owner. Chiusa quando le anteprime hanno un player funzionante **e** una route media che autorizza per token senza allargare quella owner, con il test che dimostra che un token scaduto o revocato non serve byte. |
| 4 | **Le foto non entrano nel FEED dall'interfaccia** | «Non carica ancora le foto nel feed, o almeno non c'è possibilità in UI». La capacità esiste — passo *Contenuti* → carica asset, poi *Feed* → «Post visuale» — ma è in fondo a un modulo lungo, e nelle anteprime il FEED non è reso come superficie, quindi l'esito non si vede. È la stessa regola che il pubblicato applica: un asset caricato da solo non compare nel FEED, serve un post (vedi `lib/site-visuals.ts`). Chiusa quando dal wizard si aggiunge una foto al FEED in pochi passi evidenti **e** la si vede comparire nell'anteprima. |
| 6 | **Una superficie accesa e vuota è una pagina bianca** | Misurato sulla bozza vera (`aa997fe9…`, unico sito nel progetto ospitato): MERCH è accesa e ha **zero** render, EPK è accesa e ha zero contatti, link, press, date e numeri. Le due superfici rendono il guscio del template con dentro niente — e la stessa cosa accade sul sito **pubblicato**, dove a vederla è un visitatore. Oggi non c'è nessuno stato vuoto: né un messaggio, né uno spegnimento automatico, né un avviso nel builder. Chi guarda non distingue «non c'è ancora nulla» da «è rotto». Chiusa quando una superficie accesa e priva di contenuto dice cosa manca a chi la possiede e non lascia una pagina bianca a chi visita — con la decisione, presa e scritta, se il caso limite sia uno stato vuoto o lo spegnimento della superficie. |
| 5 | **Il costruttore, dopo** | Deciso da Ray: prima il template finito, poi il costruttore. Le voci del builder restano in §1-ter. |

### La direzione che scioglie le voci 1, 2 e 3

Decisa da Ray: **l'anteprima non è una copia del sito, è il sito** — «potrebbe direttamente
essere il sito stesso che useranno». Non un renderer parallelo da tenere allineato a mano, ma
lo stesso identico percorso servito con un'autorizzazione diversa:

| chi guarda | cosa cambia |
|---|---|
| visitatore | `anon`, solo siti `published`, proiezioni `public_*` |
| owner | sessione, legge la propria bozza |
| link 24h | token, legge quella bozza finché il link vive |

Il renderer, le superfici, la navigazione e il player restano **gli stessi tre volte**. È la
regola che questo repository ha già imparato due volte a sue spese — il dock che puntava
altrove sul sito pubblicato (#26) e la ribbon che divergeva fra anteprima e pubblicato (#36):
**due strade per la stessa cosa divergono sempre**, e a scoprirlo è l'artista.

Conseguenza pratica sul confine dei media: non serve inventare un'autorizzazione nuova per il
player nelle anteprime, serve **una sola strada verso i byte con tre modi di autorizzarla**.
Il criterio della voce 3 resta quello: un token scaduto o revocato non serve byte, dimostrato
da un test.

### Un'ipotesi considerata e scartata, con la ragione

Per risolvere l'autorizzazione del link 24h era emersa l'idea di **cancellare i dati dei siti
creati e non acquistati dopo 24 ore**: senza dati, un link vecchio non trova niente. Scartata
da Ray nello stesso momento in cui l'ha proposta, e la ragione va scritta perché l'idea non
torni: un artista che rientra dopo tre giorni e trova il proprio lavoro sparito non ricomincia
— se ne va. La durata della prova si allunga; la cancellazione non è la leva.

Resta aperto, come **decisione di prodotto e non tecnica**: quanto dura la prova per un sito
mai acquistato, e cosa succede allo scadere. Lo schema oggi sa già essere umano con chi
disdice — `subscription_ended_at` e `purge_after = ended_at + 90 giorni` — ma **non dice nulla**
su una bozza mai pagata. Chiusa quando la regola esiste, è scritta dove l'artista la legge
prima di lavorare, e la sua esecuzione è quella di §1 (avvisi a 60 e 80 giorni, purga
idempotente), non una cancellazione silenziosa.

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
| Chi si registra non dimostra di possedere l'indirizzo | La conferma via email è disattivata sul progetto, quindi `signUp` restituisce una sessione subito e nessuno verifica che l'indirizzo sia davvero di chi lo scrive. È una scelta consapevole di v1 — senza SMTP configurato la conferma bloccherebbe ogni registrazione — ma significa che un indirizzo altrui può essere usato per registrarsi, e che l'indirizzo su cui il prodotto scriverà all'artista non è verificato. Chiuso quando il progetto sa spedire email da un dominio proprio, la conferma è riattivata e il ramo `data.session === null` di `registrati` (che esiste già) diventa il percorso normale invece che quello morto. |
| Il recupero password non esiste | Con l'accesso a password, chi la dimentica non ha alcuna via di rientro: `signInWithPassword` è l'unico ingresso e non c'è un `resetPasswordForEmail`. Dipende dalla stessa cosa della voce sopra — saper spedire email. `app/(auth)/_lib/magic-link-redirect.ts` e la rotta `/auth/callback` sono rimasti **senza chiamanti** dopo il passaggio alla password: non sono stati cancellati perché il recupero userà esattamente quella forma (URL di callback con destinazione ripulita, già nella allow-list di Supabase). Chiuso quando il recupero esiste e quei due moduli hanno di nuovo un chiamante, oppure quando si decide di rimuoverli. |
| `/signup` non è fra gli slug riservati | `/login` è dichiarato riservato in L0.7 §5 e `classifySlug` lo rifiuta; `/signup`, aggiunto ora, no. Oggi è comunque irraggiungibile come slug perché la rotta statica di Next precede `[slug]` nella risoluzione — ma è una difesa per coincidenza, non per contratto: dipende dall'ordine di risoluzione del framework anziché dalla regola scritta. Chiuso quando §5 elenca `signup`, `classifySlug` lo rifiuta e un test lo dimostra insieme agli altri riservati. |
| Regole morte in `globals.css` dopo Control Room | Landing e accesso hanno ora un CSS module proprio, quindi `.landing`, `.landing-azione`, `.landing-sezione`, `.landing-passi`, `.auth`, `.auth-eyebrow`, `.auth-titolo`, `.auth-claim` e `.auth-alternativa` non sono più rese da nessuno. Restano vive le classi globali che `CredentialForm` e la landing usano ancora come stringa (`auth-form`, `auth-cta`, `auth-esito`, `auth-nota`, `landing-cta`, `landing-eyebrow`, `landing-claim`, `landing-nota`). Non sono state rimosse in questa PR perché toglierle è un cambiamento visivo da ricontrollare a schermo, non una modifica meccanica. Chiuso quando le regole morte spariscono e `app/globals.test.ts` non contiene più asserzioni che le riguardano — oggi ne aveva una su `.auth-alternativa`, che era verde misurando CSS che nessuno rendeva. |
| `hexToRgb` non gestisce l'esadecimale a tre cifre | `app/[slug]/read-model.ts` fa `slice(0,2)`, `slice(2,4)`, `slice(4,6)`: su `#111` produce `NaN`, e il rapporto di contrasto diventa privo di senso invece che basso. Oggi non morde, perché i temi arrivano dal database con la forma a sei cifre imposta dallo schema, ma i fogli di stile scritti a mano usano entrambe le forme — `app/design-contrast.test.ts` deve espandere prima di misurare, e quella funzione ausiliaria è il segnale. Chiuso quando `hexToRgb` accetta le due forme, con un test che lo dimostra su `#111` e `#111111`. |
| Nessun test dimostra che `error.code` sia lo SQLSTATE | Quattro punti del codice traducono un errore del database leggendo `error.code` come SQLSTATE: `app/api/wizard/media/track/route.ts:108` (`23514`), `app/api/wizard/slug/route.ts:48` (`23505`, `23514`), `lib/wizard/upload-server.ts:149`, e la superficie di moderazione (`42501`, `23514`). È un'assunzione su come `supabase-js` propaga un'eccezione sollevata **dentro** una funzione, e **nessuna spec e2e esercita quei rami**: verificato leggendo le spec, non dedotto. Nella moderazione il modo di sbagliare è mitigato — un codice sconosciuto non produce mai un successo — ma altrove no. Chiuso quando almeno un test contro un database vero solleva l'eccezione e verifica il codice ricevuto dal client, così che l'assunzione smetta di essere condivisa da quattro punti e dimostrata da zero. |
| `interactive={false}` non ha più un chiamante di produzione | La prop del confine template è nata per l'anteprima incorporata nel builder, che è stata rimossa: la pagina del wizard serve a inserire informazioni, e mostrare il sito lì dentro ha rotto l'inserimento in quattro modi diversi. La prop resta **coperta** da `components/site-templates/site-template.test.tsx`, che la rende davvero e verifica che nessun collegamento di superficie porti un `href`, quindi non marcisce in silenzio — ma oggi nessuna pagina la usa. Non è stata tolta qui perché toccare il confine template è una preoccupazione diversa da «il builder non mostra il sito». Chiusa quando il secondo template dice se un'anteprima non navigabile serva davvero, e la prop torna ad avere un chiamante oppure sparisce insieme ai suoi banchi. |
| Nessun test dimostra che il player suoni davvero | `select()` chiamava `play()` **prima** che React scrivesse `src`, e un commento attribuiva il compito a un `onLoadedData` che sull'elemento non è mai esistito: si chiedeva di suonare alla traccia precedente, o a nessuna sorgente. Il difetto viveva su `main` da prima del template ed è stato corretto registrando l'intenzione e chiedendo `play()` da un effetto, dopo il render. **Ma la correzione non è dimostrata**: il repository non ha né jsdom né testing-library, quindi il provider non è montabile in unità, e nessuna spec e2e esercita il player vero — `e2e/shell.spec.ts` tocca soltanto il segnaposto spento dell'anteprima. Chiusa quando una spec e2e con un file audio valido seleziona una traccia e verifica lo stato di riproduzione reale (non il solo `src`), con la mutazione che riporta `play()` prima dell'aggiornamento della sorgente e mostra il rosso. |
| L'anteprima owner non è equivalente alle superfici pubblicate | La pagina intera rende HOME dentro il template vero, ma FEED, LISTEN e MERCH restano un inventario testuale della bozza. Chi la guarda per decidere se pubblicare vede la HOME come sarà e il resto come non sarà. Segnalato da chi ha consegnato il template. Chiusa quando le tre superfici della bozza passano dallo stesso `Surface` del template, oppure quando la differenza è dichiarata nell'interfaccia invece di essere implicita. |
| La superficie EPK non mostra il kit foto | `loadEpk` restituisce `photoKit` e nessuno lo rende sulla superficie: le `photo_hi` alimentano soltanto il one-sheet stampabile (dove prima di questa PR erano sempre vuote, perché il reader restituiva `[]`). Non è una perdita, è una scelta mai presa: il kit stampa è materiale per chi scrive di un artista, e la superficie EPK è il posto dove lo cercherebbe. Chiusa quando si decide se mostrarlo lì — con il testo alternativo che oggi manca allo schema — o quando si scrive che il one-sheet è la sua unica sede. |
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
