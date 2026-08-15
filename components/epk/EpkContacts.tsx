import { mailtoHref } from "./format";
import { renderableContacts } from "./select";
import { styles } from "./styles";
import type { ContactRole, EpkContact } from "./types";

const roleLabel: Record<ContactRole, string> = {
  booking: "Booking",
  management: "Management",
  press: "Stampa",
};

export type EpkContactsProps = {
  contacts: readonly EpkContact[];
  id?: string;
};

/**
 * Contatti pubblicati.
 *
 * Sta in cima all'EPK perché è la ragione per cui un booker apre la pagina dal
 * telefono. L'email è testo visibile **ed** è il bersaglio del `mailto:`: si
 * legge e si tocca senza aprire altro.
 *
 * Il consenso qui non si controlla, e non è una dimenticanza: il tipo `EpkContact`
 * non ha il campo, quindi una riga che arriva fin qui **è già pubblicabile** — o
 * viene da `public_contacts`, che filtra in SQL, o è passata da
 * `publishableContacts`, che è l'unico ponte dalla riga di tabella e l'unico
 * punto in cui il campo viene letto. Una seconda copia della regola qui sarebbe
 * un secondo posto in cui può rompersi; il compilatore fa meglio di lei.
 * Se nessun contatto è pubblicabile, la sezione non esiste: non si scrive
 * “nessun contatto disponibile”.
 */
export function EpkContacts({ contacts, id = "epk" }: EpkContactsProps) {
  const published = renderableContacts(contacts);
  if (published.length === 0) return null;
  const headingId = `${id}-contatti`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Contatti
      </h2>
      <ul style={styles.list}>
        {published.map((contact) => (
          <li key={contact.id} style={styles.card}>
            <p style={styles.name}>{contact.name}</p>
            <p style={styles.meta}>{roleLabel[contact.role]}</p>
            <a
              style={styles.action}
              href={mailtoHref(contact.email)}
              aria-label={`Scrivi a ${contact.name}, ${roleLabel[contact.role]}: ${contact.email}`}
            >
              {contact.email}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
