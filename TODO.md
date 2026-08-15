# AIDENTITY — Follow-up tecnici

Questo registro vive alla radice del repository per rendere visibili i lavori rimandati senza ampliare indebitamente una pull request. Ogni voce va chiusa tramite branch e pull request dedicate.

## Da completare prima del merge di PR-0

| Voce | Criterio di chiusura |
|---|---|
| Privilegi delle funzioni e preview link | pgTAP verifica che `PUBLIC`, `anon` e `authenticated` non possano eseguire funzioni privilegiate o trigger function; verifica inoltre che `site_preview_links` conservi un hash, non un token in chiaro. |
| RLS globale resistente alle nuove tabelle | pgTAP interroga tutte le tabelle del solo schema `public`, meno una allowlist dichiarata, e richiede sia RLS sia FORCE RLS per ogni relazione esposta. |

## Follow-up dopo il merge di PR-0

| Voce | Criterio di chiusura |
|---|---|
| Lifecycle prenotazioni e quote | Coprire release/scadenza idempotenti delle prenotazioni, neutralità degli embed e downgrade oltre quota che riporta il sito a `draft` senza cancellare contenuti. |
| Superfici pubbliche minime | Estendere i test delle proiezioni pubbliche: oltre a `owner_id`, escludere consenso, `storage_path` e byte/metadati interni. |

## Follow-up dopo il merge del filone A (non bloccanti)

Nessuna delle due voci rende falso un test verde di oggi: entrambe descrivono un
banco che oggi non saprebbe diventare rosso quando dovrebbe.

| Voce | Criterio di chiusura |
|---|---|
| `parseRgb` legge uno sfondo trasparente come nero | In `e2e/shell.spec.ts` la funzione scarta il canale alfa: `rgba(0, 0, 0, 0)` diventa `[0, 0, 0]`, indistinguibile da un nero pieno. Finché `.player-shell button` ha un `background` proprio il numero è giusto per caso; il giorno in cui un elemento lo perde, il test misura il contrasto contro un nero inesistente e riporta un valore falso — in entrambe le direzioni. Chiuso quando il test risolve lo sfondo effettivo risalendo gli antenati per ogni colore con alfa inferiore a 1 (o compone il colore sopra lo sfondo ereditato) e una prova di mutazione rimuove il `background` da `.player-shell button` mostrando il test rosso sul contrasto reale, non un numero inventato. |
| Nessun test verifica che le tre famiglie di icone rendano diverse | `iconFamily` è coperta solo come enum in `lib/contract.ts`: nessun test tocca `.icons-line`, `.icons-block`, `.icons-stencil`. Le tre regole vivono solo in `app/globals.css` e si potrebbero cancellare con la CI verde. Chiuso quando un test e2e confronta i valori calcolati di `.shell-icon` (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-dasharray`) sotto le tre famiglie e richiede che le rese siano distinte a due a due, e la prova di mutazione cancella le regole `.icons-*` mostrando la CI rossa su quel test. |

## Follow-up dopo l'Onda 1

| Voce | Criterio di chiusura |
|---|---|
| Allargare gli host embed oltre L0.7 §5 | Deciso da Ray: si farà, ma non ora. Oggi l'allowlist ammette una sola forma canonica per provider, quindi un artista che incolla il link condiviso dal telefono o uno short link se lo vede rifiutare e deve mettersi a cercare la forma giusta. Non è un difetto: è attrito, e va tolto. Chiuso quando l'insieme ammesso copre le forme che le piattaforme producono davvero (per esempio `m.youtube.com`, gli short link Spotify) **e** L0.7 §5 è emendata di conseguenza: §5 è normativa, quindi allargare la lista solo in migrazione la metterebbe in violazione. Serve un test che rifiuti comunque un host che *contiene* un dominio ammesso senza esserlo (`open.spotify.com.evil.test`): allargare non deve aprire una crepa. |
| `next dev` riscrive `AGENTS.md` | A ogni avvio del dev server Next aggiunge da sé un blocco `nextjs-agent-rules` al file e ne suggerisce il commit. Succede a ogni agente che lavora in locale e a ogni run del job e2e in CI; finora è sempre stato ripristinato a mano senza committarlo. `AGENTS.md` è un documento normativo: un tool che lo modifica da solo è un problema di governo, non di formattazione. Chiuso quando o il blocco è accettato consapevolmente e committato una volta, o la generazione è disattivata — con un test o un controllo in CI che rende rosso un `AGENTS.md` modificato dal tool. |
| `service_role` non può inserire una traccia embed | Osservato costruendo questa correzione, **su impalcatura locale e non ancora confermato sullo stack Supabase**: sotto `set local role service_role` l'insert fallisce con `42501: permission denied for function valid_embed_url`. La migrazione fa `revoke all on schema private from public` e nessun ruolo riceve `usage` su `private`, mentre il CHECK di `site_tracks` valuta `private.valid_embed_url` con i privilegi di chi scrive. Non è l'escaping — resta rotto anche dopo questa PR. Chiuso quando un pgTAP inserisce una traccia embed **assumendo esplicitamente i ruoli reali** (`authenticated` come owner e `service_role` come backend) e passa, e la stessa verifica copre le altre funzioni `private` usate nelle policy RLS. Da confermare per primo sullo stack Supabase vero: se là i grant sono diversi, la voce si chiude come non-difetto e resta il test. |

## Saldature dopo l'Onda 1 — senza queste il prodotto non funziona

Le tre voci qui sotto non sono difetti di una PR: sono i punti in cui due filoni
si affacciano l'uno sull'altro e nessuno dei due, per perimetro, poteva fare il
collegamento. Ognuna è stata verificata sul codice, non dedotta.

| Voce | Criterio di chiusura |
|---|---|
| I media non arrivano ad `anon` | Verificato: **nessuna route media esiste in nessun branch**, e `createSignedUrl`/`getPublicUrl` non compaiono da nessuna parte. Le proiezioni pubbliche escludono `storage_path` — correttamente, per L0.7 §6.3 — e rimandano a una route server che firma un URL a vita breve. Quella route non è mai stata assegnata a un filone. Finché manca, un sito pubblicato va online **senza immagini e senza audio**: HOME non ha visual principale e nessuna traccia `upload` è riproducibile. Chiuso quando esiste una route server che, dato l'`id` di un asset o di una traccia, verifica che il sito sia `published` e che la riga non sia purgata, risolve il path con privilegi elevati e restituisce un URL firmato a scadenza breve; con un test che dimostra che l'asset di un sito `draft` e quello di un altro tenant **non** sono ottenibili, e che il path non compare mai nella risposta. |
| I componenti EPK non sono collegati alla route EPK | Verificato: `app/[slug]/epk/page.tsx` importa `EpkIdentity` da `../surface-content`, **non** da `components/epk`. E ha costruito i componenti con i tipi allineati alle colonne del database, D ha costruito la route: il cablaggio non era nel perimetro di nessuno dei due. Oggi la superficie EPK rende solo bio e identità, e i componenti di E non li usa nessuno. Chiuso quando la route rende i componenti di `components/epk` con i dati che `loadEpk` restituisce, senza adattatori intermedi — i tipi di E sono già allineati alle colonne apposta — e un test dimostra che un contatto senza consenso non compare nella pagina resa, non solo nella funzione di selezione. |
| `SiteReader` e il client di B non sono saldati | Verificato: `configureSiteReader` **non ha alcun chiamante** fuori dal proprio modulo. D si è fermato prima del wiring per istruzione esplicita, e ha fatto bene: l'interfaccia è sua e non deve importare il client. Ma la saldatura ora tocca a qualcuno. Finché manca, **ogni slug risponde 404** — il renderer è completo e non legge niente. Chiuso quando esiste un adattatore che implementa i sei metodi di `SiteReader` sopra il client server anonimo di `lib/supabase/public-reader.ts`, e un solo punto fuori da `app/[slug]/**` chiama `configureSiteReader`. Il presidio che vieta a `app/[slug]/**` di importare il client Supabase resta valido e non va allentato: l'adattatore vive fuori da quel perimetro. |

## Debito dichiarato, non bloccante

Le due voci nascono dal filone C — Wizard e vanno studiate **dopo il primo
deploy**. Nessuna delle due rende falso un test verde di oggi: la prima descrive
una difesa che si è ridotta a un livello solo, la seconda un banco che passava
senza dimostrare ciò che diceva di dimostrare.

| Voce | Criterio di chiusura |
|---|---|
| La difesa sui byte dell'upload vive a un livello solo | La policy Storage di C confrontava `metadata->>'size'` con i byte prenotati. Misurato: non poteva funzionare, perché Supabase valuta la RLS in `prepareUpload`, **prima** che i byte arrivino, e in quel momento `metadata` contiene solo `mimetype` e `contentLength`; `size` nasce dopo, quando `completeUpload` scrive la riga con `asSuperUser()`, che la RLS non attraversa. La condizione negava ogni upload di ogni utente ed è stata rimossa. Oggi il confronto vive solo in `lib/wizard/upload-server.ts` (`assertStoredSize`, via `info()`), che però vede la dimensione **realmente memorizzata**: non è un buco, è difesa in profondità perduta. Chiuso quando si stabilisce se il confronto sia riottenibile a livello di Storage sapendo che alla valutazione della RLS esiste il solo `contentLength`, che è **dichiarato dal client** e quindi non è una garanzia — e se la risposta è no, quando la decisione è scritta accanto alla policy come scelta definitiva invece che come rimozione temporanea. |
| Il banco 133 provava un invariante nel posto sbagliato | `e2e/wizard-upload.spec.ts` pretendeva che una dimensione diversa dalla prenotazione fosse **negata dalla policy Storage**. Con la policy precedente sarebbe passato, ma perché *tutto* veniva negato: un verde che non dimostrava niente. Riscritto per misurare dove la garanzia vive davvero — l'oggetto entra, la finalizzazione lo rifiuta con `stored-object-mismatch`, la prenotazione non viene consumata e la quota torna libera — e verificato con una prova di mutazione sul controllo in `upload-server.ts`. Chiuso quando gli altri banchi della suite upload sono riletti con la stessa domanda, «passerebbe anche se la cosa che verifica fosse rotta?», e ognuno ha o una prova di mutazione o una ragione scritta per cui non serve. |

> Nessuna voce di questo file autorizza modifiche dirette a `main`: ogni intervento resta soggetto a branch, pull request e CI verde.
