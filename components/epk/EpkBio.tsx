"use client";

import { useRef, useState, type RefObject } from "react";

import { copyRenderedText } from "./clipboard";
import { filled } from "./format";
import { styles } from "./styles";

export type EpkBioProps = {
  shortBio: string | null;
  longBio: string | null;
  id?: string;
};

/**
 * Bio breve e lunga, copiabili con un tocco.
 *
 * Due scelte non sono negoziabili:
 *
 * 1. **Si copia il testo reso, non la prop.** Il testo arriva da `textContent`
 *    del paragrafo che l'utente sta guardando. Copiare una seconda volta la
 *    stringa significherebbe avere due sorgenti che possono divergere — basta
 *    un `trim` in più da una parte sola.
 * 2. **L'esito è annunciato.** Una regione `aria-live="polite"` esiste nel DOM
 *    fin dal primo render (vuota) e cambia contenuto dopo la copia. Un `alert`
 *    interrompe; un testo che appare in un punto che nessuno sta osservando non
 *    viene letto.
 *
 * Il componente è l'unico `"use client"` dell'EPK: riceve solo due stringhe.
 * I contatti, e con loro il campo del consenso, restano lato server.
 */
export function EpkBio({ shortBio, longBio, id = "epk" }: EpkBioProps) {
  const shortRef = useRef<HTMLParagraphElement>(null);
  const longRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState("");

  const short = filled(shortBio) ? shortBio.trim() : null;
  const long = filled(longBio) ? longBio.trim() : null;
  if (short === null && long === null) return null;

  const copy = async (source: RefObject<HTMLParagraphElement | null>, label: string) => {
    const done = await copyRenderedText(source.current);
    setStatus(
      done
        ? `${label} copiata negli appunti.`
        : `Copia non riuscita: seleziona il testo della ${label.toLowerCase()} e copialo a mano.`,
    );
  };

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
          <p>
            <button
              type="button"
              style={styles.quietAction}
              aria-label="Copia la bio breve"
              onClick={() => {
                void copy(shortRef, "Bio breve");
              }}
            >
              Copia
            </button>
          </p>
        </div>
      )}

      {long === null ? null : (
        <div style={styles.bio}>
          <h3 style={styles.subheading}>Bio lunga</h3>
          <p ref={longRef} data-epk-bio="long" style={styles.bioText}>
            {long}
          </p>
          <p>
            <button
              type="button"
              style={styles.quietAction}
              aria-label="Copia la bio lunga"
              onClick={() => {
                void copy(longRef, "Bio lunga");
              }}
            >
              Copia
            </button>
          </p>
        </div>
      )}

      <p role="status" aria-live="polite" aria-atomic="true" style={styles.status}>
        {status}
      </p>
    </div>
  );
}
