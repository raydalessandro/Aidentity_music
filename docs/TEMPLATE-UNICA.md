# Unica — contratto visuale del primo template

## Obiettivo

`Unica` è il primo template reale di Aidentity. È mobile-first e usa **NVLL CLICK come reference visuale diretta**, non come semplice ispirazione: topbar fissa, hero fotografico dominante, tipografia display estrema, griglia tecnica, dock persistente, player sopra il dock, moduli editoriali e ribbon visuale.

Il template non aggiunge un secondo modello dati. Consuma il contratto Aidentity esistente e cambia soltanto la regia visuale.

## Struttura stabile

Tutti i template continuano a offrire le stesse cinque superfici:

- HOME
- FEED
- LISTEN
- EPK
- MERCH

Il dock segue il contratto canonico:

```text
FEED    LISTEN    [ EPK ]    MERCH    HOME
```

**EPK è il tasto centrale.** In NVLL CLICK quella posizione è occupata da WORLD 00; in Aidentity la stessa geometria viene tradotta sulla superficie centrale del prodotto, senza cambiare il modello dati.

La HOME di Unica ordina l'esperienza così:

1. topbar / identità;
2. hero visuale con nome, bio breve e CTA;
3. tre porte editoriali verso LISTEN, FEED ed EPK;
4. claim / manifesto e bio lunga;
5. ribbon dei visual già presenti nel FEED;
6. player e dock persistenti.

## Personalizzazione compatibile

Restano pienamente attive le leve già previste dal contratto:

- nome, handle, claim, luogo, bio breve e lunga;
- sette token colore della palette;
- coppia tipografica;
- famiglia icone;
- grana;
- visual principale;
- superfici attive;
- etichette delle superfici.

La ribbon non introduce un nuovo campo persistito: riceve una proiezione render-ready degli asset `visual` che esistono già in `site_assets` e che sono referenziati dal FEED. Gli URL vengono derivati dalla route media usando `(site_id, asset_id)`, senza esporre `storage_path`.

## Dato non ancora presente: alt testuale per asset

`site_assets` v1 non persiste un testo alternativo editoriale. Il renderer usa quindi fallback contestuali (`Visual di <artista>`, caption del post, `Render merch N`). Se in futuro si vuole rendere l'alt modificabile dall'artista, quello è un emendamento del modello dati e va trattato separatamente dal template.

## Builder mobile

Il builder mostra il template mentre viene modificato. Su mobile non simula un telefono dentro il telefono: il renderer occupa il viewport e i controlli entrano come pannello / bottom sheet sopra la preview.

Ordine UX:

1. Nome e identità
2. Stile
3. Visual + musica
4. Press kit

Quando arriverà un secondo template, la scelta non dovrà essere obbligatoria all'inizio: l'artista deve poter vedere altri layout già popolati con i propri dati e cambiare stile a posteriori.

## Regola per i template successivi

Un nuovo template non inventa un nuovo prodotto. Reinterpreta gli stessi dati e le stesse superfici.

Sono lecite variazioni di composizione, scala tipografica, uso di fotografia/SVG, dock, ritmo verticale e styling delle superfici. Restano da evitare campi richiesti da un solo template, route esclusive, un secondo player audio, CSS/HTML libero salvato dall'utente o logica di pubblicazione dentro il template.
