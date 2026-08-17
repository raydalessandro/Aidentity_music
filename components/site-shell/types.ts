import type { SiteConfig } from "../../lib/contract";

/**
 * Vocabolario di tipi del guscio visuale, estratto da `SiteShell.tsx` perché il confine
 * template possa dipendere dai **tipi** senza dipendere dal componente.
 *
 * Senza questo file `components/site-templates/types.ts` dovrebbe importare un modulo `.tsx`
 * solo per nominare `ShellDestination`, e il livello di dispatch finirebbe legato al
 * particolare renderer che oggi lo implementa. `SiteShell.tsx` ri-esporta tutto ciò che
 * esportava prima: nessun chiamante esistente cambia import.
 */

/**
 * Forma minima consumata dal livello visuale. Resta derivata dal contratto canonico:
 * il template non introduce una seconda configurazione e non decide cosa persistere.
 */
export type ShellConfig = Pick<
  SiteConfig,
  "identity" | "fontPair" | "iconFamily" | "grain" | "surfaces" | "sectionCopy"
>;

export type ShellSurfaceId = "feed" | "listen" | "epk" | "merch" | "home";

/**
 * Lo stesso guscio serve quattro superfici molto diverse: il sito **pubblicato**, l'anteprima
 * dell'owner, l'anteprima da token e lo showroom dei template. Fino a qui le rendeva tutte
 * come se fossero un'anteprima a schermo unico, e sul sito vero questo si vedeva: il dock
 * puntava ad ancore (`#feed-<previewId>`) verso sezioni che su quella pagina non esistono,
 * quindi **nessuna superficie era raggiungibile cliccando**; la topbar diceva `PREVIEW` a un
 * visitatore; e un player permanentemente spento occupava lo spazio del player vero, che su
 * `/[slug]` vive nel layout.
 *
 * La destinazione è un'unione discriminata e non due prop separate perché i due difetti non
 * devono poter tornare a combinarsi: non esiste un `pubblicato` senza gli href delle rotte,
 * e non esiste un'`anteprima` che ne porti. Il tipo lo impedisce, non la disciplina di chi
 * chiama.
 *
 * D lo aveva chiesto per iscritto in testa a `app/[slug]/surface-content.tsx`: «non lo
 * duplico e non lo modifico: chiedo nel report che A accetti gli href». Questo è A che li
 * accetta.
 */
export type ShellDestination =
  | { readonly kind: "anteprima" }
  /**
   * L'anteprima che **è** il sito.
   *
   * Decisione di Ray: «potrebbe direttamente essere il sito stesso che useranno». Non un
   * renderer parallelo da tenere allineato a mano, ma lo stesso percorso servito con
   * un'autorizzazione diversa — sessione per l'owner, token per il link a scadenza. Porta
   * gli href come `pubblicato`, quindi il dock naviga e le superfici sono pagine a sé; ma
   * `published` resta falso, quindi la topbar continua a dire che è un'anteprima.
   *
   * Perché una terza forma e non un booleano in più: le due invarianti della #26 devono
   * restare indistruttibili — non esiste un `pubblicato` senza href, e non esiste
   * un'`anteprima` a schermo unico che ne porti. Questa è la terza combinazione legittima,
   * e il tipo la nomina invece di lasciarla nascere da una coppia di flag.
   */
  | { readonly kind: "anteprima-navigabile"; readonly hrefs: Readonly<Record<ShellSurfaceId, string>> }
  | { readonly kind: "pubblicato"; readonly hrefs: Readonly<Record<ShellSurfaceId, string>> };
