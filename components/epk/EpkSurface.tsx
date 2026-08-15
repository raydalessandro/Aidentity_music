import { EpkBio } from "./EpkBio";
import { EpkContacts } from "./EpkContacts";
import { EpkLinks } from "./EpkLinks";
import { EpkLiveDates } from "./EpkLiveDates";
import { EpkMetrics } from "./EpkMetrics";
import { EpkPress } from "./EpkPress";
import { styles } from "./styles";
import type { EpkContent } from "./types";

export type EpkSurfaceProps = {
  content: EpkContent;
  /** Momento di riferimento per separare le date. Iniettabile per rendere deterministico il render. */
  now?: Date;
  /**
   * Prefisso degli `id` generati e `id` della sezione: il dock del guscio punta qui.
   * Montare due EPK sulla stessa pagina richiede due `id` diversi, altrimenti
   * gli `id` collidono e l'accessibilità va a pezzi.
   */
  id?: string;
  /**
   * Nome accessibile della region. È l'unico landmark dell'EPK, quindi due EPK
   * sulla stessa pagina devono avere nomi diversi (axe `landmark-unique`).
   * L0.7 §7 prevede che `sectionCopy.epk` possa sovrascrivere questa etichetta.
   */
  label?: string;
};

/**
 * La superficie EPK completa.
 *
 * L'ordine delle sezioni è una scelta di prodotto: **contatti prima di tutto**,
 * poi la bio. Chi apre un EPK dal telefono lo apre per decidere se scrivere a
 * qualcuno; l'email e la bio devono stare sopra la piega, non dopo tre
 * caroselli. Seguono link, stampa, date e numeri.
 *
 * Le sezioni vuote non esistono: niente intestazioni orfane e nessun testo
 * segnaposto (L0.7 §7). Con un contenuto interamente vuoto resta solo il
 * contenitore, che serve al filone D come punto di ancoraggio.
 *
 * Nessun colore letterale: tutto passa dalle otto custom property iniettate da
 * `SiteShell`, quindi il componente non ha una palette propria da mantenere
 * allineata.
 */
export function EpkSurface({ content, now, id = "epk", label = "EPK" }: EpkSurfaceProps) {
  return (
    <section id={id} style={styles.root} aria-label={label}>
      <EpkContacts contacts={content.contacts} id={id} />
      <EpkBio shortBio={content.shortBio} longBio={content.longBio} id={id} />
      <EpkLinks links={content.links} id={id} />
      <EpkPress press={content.press} id={id} />
      <EpkLiveDates dates={content.dates} now={now} id={id} />
      <EpkMetrics metrics={content.metrics} id={id} />
    </section>
  );
}
