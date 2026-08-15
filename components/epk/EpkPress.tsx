import { httpsUrl, readDateLabel } from "./format";
import { publishablePress } from "./select";
import { styles } from "./styles";
import type { EpkPressQuote } from "./types";

export type EpkPressProps = {
  press: readonly EpkPressQuote[];
  id?: string;
};

/**
 * Quote stampa: `quote` e `publication` obbligatorie, `published_on` e `url`
 * opzionali (L0.7 §5).
 *
 * Un URL non `https` non cancella la citazione, cancella il link: la testata
 * resta testo. È l'unico punto in cui questo URL viene validato, quindi
 * l'invariante ha un solo posto in cui può rompersi.
 */
export function EpkPress({ press, id = "epk" }: EpkPressProps) {
  const published = publishablePress(press);
  if (published.length === 0) return null;
  const headingId = `${id}-stampa`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Stampa
      </h2>
      <ul style={styles.list}>
        {published.map((entry) => {
          const href = httpsUrl(entry.url);
          const when = entry.published_on === null ? null : readDateLabel(entry.published_on);
          return (
            <li key={entry.id}>
              <blockquote style={styles.quote} cite={href ?? undefined}>
                <p style={styles.quoteText}>{entry.quote.trim()}</p>
                <footer style={styles.source}>
                  {href === null ? (
                    entry.publication.trim()
                  ) : (
                    <a style={styles.link} href={href} rel="noreferrer">
                      {entry.publication.trim()}
                    </a>
                  )}
                  {when === null ? null : ` · ${when}`}
                </footer>
              </blockquote>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
