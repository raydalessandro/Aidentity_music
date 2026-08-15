import { httpsUrl } from "./format";
import { splitLiveDates, type ResolvedLiveDate } from "./select";
import { styles } from "./styles";
import type { EpkLiveDate } from "./types";

export type EpkLiveDatesProps = {
  dates: readonly EpkLiveDate[];
  /** Momento di riferimento. Esplicito e iniettabile: un componente che legge l'orologio da solo non è testabile. */
  now?: Date;
  id?: string;
};

function DateList({ entries, labelledBy }: { entries: ResolvedLiveDate[]; labelledBy: string }) {
  return (
    <ul style={styles.list} aria-labelledby={labelledBy}>
      {entries.map(({ date, when }) => {
        const ticket = httpsUrl(date.ticket_url);
        return (
          <li key={date.id} style={styles.dateRow}>
            <p style={styles.when}>
              <time dateTime={date.starts_at}>
                {when.dateLabel} · {when.timeLabel}
              </time>
            </p>
            <p style={styles.where}>
              {date.city.trim()} — {date.venue.trim()}
            </p>
            {ticket === null ? null : (
              <p>
                <a
                  style={styles.quietAction}
                  href={ticket}
                  rel="noreferrer"
                  aria-label={`Biglietti per ${date.venue.trim()}, ${date.city.trim()}`}
                >
                  Biglietti
                </a>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Date live, separate fra future e passate.
 *
 * Ordinamento dichiarato (scelta di prodotto, non dettaglio di
 * implementazione): **future crescenti**, perché chi legge cerca la prossima
 * occasione; **passate decrescenti**, perché servono come prova di attività
 * recente. Una data esattamente uguale a `now` conta come futura.
 *
 * L'orario mostrato è quello locale dichiarato nell'offset del `timestamptz`:
 * l'ora del concerto è l'ora del posto in cui si suona, non quella del server.
 */
export function EpkLiveDates({ dates, now = new Date(), id = "epk" }: EpkLiveDatesProps) {
  const { upcoming, past } = splitLiveDates(dates, now);
  if (upcoming.length === 0 && past.length === 0) return null;

  const headingId = `${id}-date`;
  const upcomingId = `${id}-date-prossime`;
  const pastId = `${id}-date-passate`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Date live
      </h2>
      {upcoming.length === 0 ? null : (
        <>
          <h3 id={upcomingId} style={styles.subheading}>
            Prossime date
          </h3>
          <DateList entries={upcoming} labelledBy={upcomingId} />
        </>
      )}
      {past.length === 0 ? null : (
        <>
          <h3 id={pastId} style={styles.subheading}>
            Date passate
          </h3>
          <DateList entries={past} labelledBy={pastId} />
        </>
      )}
    </div>
  );
}
