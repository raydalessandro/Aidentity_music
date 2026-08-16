# Unica — contratto visuale del primo template

## Obiettivo

`Unica` è il primo template reale di Aidentity. Nasce mobile-first per artisti emergenti che condividono il sito soprattutto da Instagram, TikTok, WhatsApp e DM. La reference visuale è il linguaggio già validato nel progetto NVLL CLICK: hero fotografico dominante, tipografia grande, navigazione persistente vicino al pollice, moduli editoriali e un ruolo centrale per l'ascolto.

Il template non aggiunge un secondo modello dati. Consuma il contratto Aidentity esistente e cambia soltanto la regia visuale.

## Struttura da considerare stabile

Tutti i template futuri devono continuare a offrire le stesse cinque superfici:

- HOME
- FEED
- LISTEN
- EPK
- MERCH

La HOME di Unica ordina l'esperienza così:

1. identità immediata: visual, nome, luogo/handle, claim;
2. azione primaria: LISTEN;
3. azione secondaria: FEED;
4. tre porte editoriali verso LISTEN, FEED ed EPK;
5. bio/manifesto;
6. fascia visuale/decorativa;
7. dock persistente.

LISTEN occupa il centro del dock. Per il target iniziale la musica è il centro percettivo; EPK rimane una superficie necessaria ma non guida la prima impressione.

## Cosa può variare senza cambiare struttura

Queste sono le leve di personalizzazione già compatibili con il contratto:

- nome, handle, claim, luogo, bio breve e lunga;
- sette token colore della palette;
- coppia tipografica;
- famiglia icone;
- grana;
- visual principale;
- superfici attive.

Le aree con `data-art-slot` sono punti di innesto intenzionali per i futuri set SVG componibili. Oggi hanno una decorazione neutra. Quando esisterà il catalogo SVG, il renderer potrà sostituirne il contenuto senza cambiare la geometria del template.

Slot iniziali:

- `hero-mark`
- `rail-a`
- `rail-b`
- `rail-c`

Il catalogo SVG non viene ancora persistito: prima va costruito un set reale e va definito il vocabolario da salvare. Stessa regola adottata per `templateId`: niente contratto prematuro.

## Regola per i template successivi

Un nuovo template non deve inventare un nuovo prodotto. Deve reinterpretare gli stessi dati e le stesse superfici.

Esempi di variazione lecita:

- differente composizione hero;
- diversa scala tipografica;
- differente uso di fotografia e SVG;
- dock visualmente diverso;
- ritmo verticale e densità differenti;
- styling specifico di LISTEN / FEED / EPK / MERCH.

Esempi da evitare:

- campi dati richiesti da un solo template;
- route esclusive di un template;
- un player audio aggiuntivo;
- CSS/HTML libero salvato dall'utente;
- logica di pubblicazione dentro il template.

## Builder mobile

Il builder dovrà mostrare il template mentre viene modificato. Su mobile non va simulato un telefono dentro il telefono: il renderer occupa il viewport e i controlli entrano come pannello / bottom sheet sopra la preview.

Ordine UX previsto:

1. Nome e identità
2. Stile
3. Visual + musica
4. Press kit

Quando arriverà il secondo template, la scelta non dovrebbe essere obbligatoria all'inizio. L'artista deve poter vedere gli altri template già popolati con i propri dati e cambiare stile a posteriori.
