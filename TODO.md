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

> Nessuna voce di questo file autorizza modifiche dirette a `main`: ogni intervento resta soggetto a branch, pull request e CI verde.
