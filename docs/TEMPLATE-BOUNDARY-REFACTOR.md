# AIDENTITY — confine template prima del design

## Scopo

Preparare il renderer a più layout senza introdurre ancora una scelta di template nel prodotto.
Questa PR è un refactor strutturale: il template `baseline` deve rendere ciò che rende `main`
prima della PR, mentre le route smettono di possedere il chrome visuale.

## Perché adesso

Prima di questa PR HOME usava `SiteShell`, le altre superfici ricostruivano un secondo guscio
dentro `app/[slug]/surface-content.tsx`, e le due preview montavano `SiteShell` direttamente.
Migliorare il design in questa forma costringerebbe ogni nuovo layout a conoscere route
pubbliche, preview e renderer invece di limitarsi alla presentazione.

## Decisione di confine

Il nuovo livello è `components/site-templates/`:

```text
route / preview
      │
      ▼
SiteTemplateHome / SiteTemplateSurface
      │
      ▼
registry
      │
      └── baseline
```

`baseline` è l'unico template registrato in questa PR. HOME delega al `SiteShell` esistente senza
wrapper di markup; le superfici non-HOME ricevono contenuto e navigazione come dati e possiedono
soltanto la composizione visuale.

Due file di supporto rendono il confine possibile senza inversioni di dipendenza:

- `components/site-shell/types.ts` — `ShellConfig`, `ShellSurfaceId`, `ShellDestination`, così
  che `site-templates/types.ts` possa nominarli senza importare un modulo `.tsx`;
- `components/site-shell/style.ts` — `paletteVars`, che era privata in `SiteShell.tsx` e
  ricopiata alla lettera in `app/[slug]/theme.ts`. Il duplicato è chiuso.

`SiteShell.tsx` ri-esporta tutto ciò che esportava prima: nessun import esistente cambia.

## Cosa NON cambia

- nessuna route;
- nessun dato letto o scritto;
- nessuna policy RLS;
- nessuna migrazione;
- nessuna forma di `SiteConfig`;
- nessun CSS di design;
- nessun player, EPK, FEED, LISTEN, MERCH o one-sheet;
- nessuna dipendenza.

In particolare non compare `templateId` nel JSON persistito. L0.7 v1 dichiara la forma chiusa e
il layout non configurabile: persistere oggi una scelta di layout sarebbe una decisione di
prodotto e un emendamento del contratto, non un refactor. Il banco
`components/site-templates/site-template.test.tsx` lo misura: una config con `templateId` viene
**rifiutata** da `siteConfigSchema`, che è `.strict()`.

## DB

`site_config.config` resta il JSONB canonico v1 e `hero_asset_id` resta fuori dal JSON. Il confine
template è runtime-only, quindi questa PR non ha motivo di toccare Postgres.

## Il punto delicato: `destination`

La prop che questo refactor mette più a rischio è `ShellDestination`, introdotta dalla #26.
Distingue un sito **pubblicato** — dock verso le rotte, niente `PREVIEW · IT`, niente player
segnaposto accanto a `PlayerBar` — da un'**anteprima**. È opzionale, e il suo default è
l'anteprima.

Ne segue che un livello di dispatch che smettesse di propagarla **non produrrebbe un errore di
tipo**: produrrebbe un sito pubblicato che torna a comportarsi come un'anteprima. Per questo:

1. `SiteTemplateHome` inoltra con `{...props}`, mai con un elenco esplicito di prop;
2. `BaselineHome` è un passaggio puro verso `SiteShell`;
3. `app/[slug]/dock-routing.test.tsx` — i 12 banchi della #26 — rende la HOME pubblicata
   **attraverso** `SiteTemplateHome` e non più direttamente con `SiteShell`. Una propagazione
   persa accende quei banchi, non solo quelli del confine.

Per le superfici non-HOME l'equivalente è `published`, che `ShellTopbar` richiede senza default.
`SiteTemplateSurfaceProps` lo richiede a sua volta invece di cablarlo nel template: la parola che
esce dalla topbar la legge il visitatore di un sito vero, e non deve essere il livello di
presentazione a sceglierla. Gli indirizzi delle superfici arrivano da `navigation`, cioè da
`surfaceHref`, la stessa sorgente che alimenta il dock: `ShellDestination` **non** compare nei
props della superficie, perché due sorgenti di verità per lo stesso indirizzo sono il difetto
che la #26 ha chiuso.

## Invarianti protetti

1. Il markup HOME del template `baseline` è identico a quello di `SiteShell` a parità di props,
   sia in anteprima sia con destinazione pubblicata.
2. Le superfici mantengono label da `sectionCopy`, filtro delle superfici spente e
   `aria-current` sulla superficie corrente.
3. HOME pubblica, showroom, preview owner e preview token entrano tutte da `SiteTemplateHome`;
   solo la HOME pubblica dichiara una `destination`.
4. Le superfici pubbliche entrano da `SiteTemplateSurface`.
5. Il renderer di route conserva contenuti e dominio; il template possiede solo chrome e layout.
6. `templateId` non entra nel contratto persistito.

## Dopo il merge: fase design

Un nuovo layout può essere sviluppato senza toccare il database:

1. aggiunge un renderer in `components/site-templates/<nome>.tsx`;
2. lo registra nel registry;
3. lo prova nello showroom passando `templateId` esplicitamente;
4. sviluppa HOME e frame delle superfici contro gli stessi props.

Solo quando esiste almeno un secondo layout reale e approvato si apre una PR separata di prodotto
per rendere la scelta persistente. Quella PR emenda L0.7, estende Zod e la validazione DB del JSON,
aggiunge la selezione nel wizard e passa il valore al dispatcher. Il design non deve aspettare
quella decisione e questa PR non la anticipa.

## Accettazione

- `npm run check` verde;
- test nuovo del confine template verde;
- nessuna migrazione aggiunta;
- diff del CSS di design vuoto;
- le route non importano più `SiteShell` direttamente;
- nessun cambiamento di output atteso per `baseline`.
