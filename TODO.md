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

> Nessuna voce di questo file autorizza modifiche dirette a `main`: ogni intervento resta soggetto a branch, pull request e CI verde.
