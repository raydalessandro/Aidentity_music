"use client";

import { useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { copyRenderedText } from "./clipboard";
import { filled } from "./format";
import { styles } from "./styles";

/**
 * "Il componente è idratato?" senza `useEffect` e senza setState a cascata:
 * lo snapshot lato server è `false`, quello lato client `true`, e non cambia
 * mai più — perciò la sottoscrizione non ha nulla da osservare.
 */
const nessunaSottoscrizione = () => () => undefined;
const nelBrowser = () => true;
const nelServer = () => false;

/**
 * Testo annunciato dopo un tentativo di copia.
 *
 * È una funzione esportata, non due stringhe sepolte in un `onClick`, perché
 * il ramo del fallimento deve poter diventare rosso in un test: un annuncio che
 * non c'è è un difetto di accessibilità silenzioso, esattamente il tipo di
 * difetto che nessuno vede finché non tocca a chi non vede lo schermo.
 */
export function messaggioCopia(label: string, riuscita: boolean): string {
  return riuscita
    ? `${label} copiata negli appunti.`
    : `Copia non riuscita: seleziona il testo della ${label.toLowerCase()} e copialo a mano.`;
}

export type EpkBioProps = {
  shortBio: string | null;
  longBio: string | null;
  id?: string;
};

/**
 * Bio breve e lunga, copiabili con un tocco.
 *
 * Tre scelte non sono negoziabili:
 *
 * 1. **Si copia il testo reso, non la prop.** Il testo arriva da `textContent`
 *    del paragrafo che l'utente sta guardando (`copyRenderedText` accetta un
 *    elemento, non una stringa). Copiare una seconda volta la stringa
 *    significherebbe avere due sorgenti che possono divergere — basta un `trim`
 *    in più da una parte sola.
 * 2. **L'esito è annunciato, sempre e in entrambi i casi.** Una regione
 *    `aria-live="polite"` esiste nel DOM fin dal primo render (vuota) e cambia
 *    contenuto dopo il tentativo. Riuscito o fallito non cambia: chi non vede
 *    lo schermo non ha altro modo di sapere com'è andata, e il silenzio è la
 *    risposta peggiore. Per questo la chiamata sta dentro `try/catch`: nessun
 *    percorso — permesso negato, API appesa, ricaduta esplosa — può finire
 *    senza che qualcuno lo dica.
 * 3. **Il bottone appare solo quando può funzionare.** È reso dopo il mount:
 *    senza JavaScript non si mostra un comando inerte che non risponde e non
 *    annuncia niente. La bio resta leggibile e selezionabile comunque.
 *
 * Il componente è l'unico `"use client"` dell'EPK: riceve solo due stringhe.
 * I contatti, e con loro il campo del consenso, restano lato server.
 */
export function EpkBio({ shortBio, longBio, id = "epk" }: EpkBioProps) {
  const shortRef = useRef<HTMLParagraphElement>(null);
  const longRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState("");
  const attivo = useSyncExternalStore(nessunaSottoscrizione, nelBrowser, nelServer);

  const short = filled(shortBio) ? shortBio.trim() : null;
  const long = filled(longBio) ? longBio.trim() : null;
  if (short === null && long === null) return null;

  const copy = async (source: RefObject<HTMLParagraphElement | null>, label: string) => {
    // `copyRenderedText` non lancia per contratto (provato in `epk.test.tsx`),
    // quindi questa riga è raggiunta in ogni esito e la regione parla sempre.
    setStatus(messaggioCopia(label, await copyRenderedText(source.current)));
  };

  const bottone = (source: RefObject<HTMLParagraphElement | null>, label: string) =>
    attivo ? (
      <p>
        <button
          type="button"
          style={styles.quietAction}
          aria-label={`Copia la ${label.toLowerCase()}`}
          onClick={() => {
            void copy(source, label);
          }}
        >
          Copia
        </button>
      </p>
    ) : null;

  const headingId = `${id}-bio`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Bio
      </h2>

      {short === null ? null : (
        <div style={styles.bio}>
          <h3 style={styles.subheading}>Bio breve</h3>
          <p ref={shortRef} data-epk-bio="short" style={styles.bioText}>
            {short}
          </p>
          {bottone(shortRef, "Bio breve")}
        </div>
      )}

      {long === null ? null : (
        <div style={styles.bio}>
          <h3 style={styles.subheading}>Bio lunga</h3>
          <p ref={longRef} data-epk-bio="long" style={styles.bioText}>
            {long}
          </p>
          {bottone(longRef, "Bio lunga")}
        </div>
      )}

      <p role="status" aria-live="polite" aria-atomic="true" style={styles.status}>
        {status}
      </p>
    </div>
  );
}
