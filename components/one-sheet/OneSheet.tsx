import type { CSSProperties, ReactNode } from "react";

import { prepareOneSheet, type OneSheetInput } from "./model";
import { ONE_SHEET_PRINT_OPTIMIZER_SCRIPT } from "./print";
import styles from "./one-sheet.module.css";

type OneSheetProps = { readonly input: OneSheetInput };

type ThemeStyle = CSSProperties & {
  "--os-ink": string;
  "--os-panel": string;
  "--os-paper": string;
  "--os-muted": string;
  "--os-dim": string;
  "--os-line": string;
  "--os-acid": string;
  "--os-acid-ink": string;
};

const roleLabel: Readonly<Record<"booking" | "management" | "press", string>> = {
  booking: "Booking",
  management: "Management",
  press: "Stampa",
};

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function OneSheet({ input }: OneSheetProps) {
  const sheet = prepareOneSheet(input);
  const style: ThemeStyle = {
    "--os-ink": sheet.palette.ink,
    "--os-panel": sheet.palette.panel,
    "--os-paper": sheet.palette.paper,
    "--os-muted": sheet.palette.muted,
    "--os-dim": sheet.palette.dim,
    "--os-line": sheet.palette.line,
    "--os-acid": sheet.palette.acid,
    "--os-acid-ink": sheet.palette.acidInk,
  };
  const longBio = sheet.density === "low" ? sheet.identity.shortBio : sheet.identity.longBio;

  return (
    <main className={styles.preview} aria-label={`One-sheet di ${sheet.identity.name}`}>
      <article className={styles.sheet} data-density={sheet.density} data-one-sheet style={style}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>PRESS ONE-SHEET · {sheet.identity.location}</p>
            <h1>{sheet.identity.name}</h1>
            <p className={styles.claim}>{sheet.identity.claim}</p>
          </div>
          <div className={styles.handle}>@{sheet.identity.handle}</div>
        </header>

        {sheet.photoKit.length > 0 ? (
          <div className={styles.photos} aria-label="Foto stampa">
            {sheet.photoKit.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- URL mediato e revocabile dalla route media.
              <img
                key={photo.id}
                src={photo.src}
                alt={photo.alt ?? `Foto stampa ${index + 1} di ${sheet.identity.name}`}
                data-one-sheet-photo
              />
            ))}
          </div>
        ) : null}

        <div className={styles.body}>
          <div className={styles.primary}>
            <Section title="Bio">
              <p className={styles.bio}>{longBio}</p>
            </Section>

            {sheet.press.length > 0 ? (
              <Section title="Stampa">
                <div className={styles.stack}>
                  {sheet.press.map((item) => (
                    <blockquote key={item.id} className={styles.quote}>
                      <p>“{item.quote}”</p>
                      <footer>{item.publication}{item.published_on ? ` · ${item.published_on}` : ""}</footer>
                    </blockquote>
                  ))}
                </div>
              </Section>
            ) : null}

            {sheet.dates.length > 0 ? (
              <Section title="Live">
                <ul className={styles.list}>
                  {sheet.dates.map((date) => (
                    <li key={date.id}>
                      <strong>{formatDate(date.starts_at)}</strong>
                      <span>{date.venue} · {date.city}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          <aside className={styles.secondary} aria-label="Contatti e dati essenziali">
            {sheet.contacts.length > 0 ? (
              <Section title="Contatti">
                <ul className={styles.compactList}>
                  {sheet.contacts.map((contact) => (
                    <li key={contact.id}>
                      <span>{roleLabel[contact.role]} · {contact.name}</span>
                      <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {sheet.links.length > 0 ? (
              <Section title="Ascolta e segui">
                <ul className={styles.compactList}>
                  {sheet.links.map((link) => (
                    <li key={link.id}><a href={link.url}>{link.provider.replaceAll("_", " ")}</a></li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {sheet.metrics.length > 0 ? (
              <Section title="Numeri">
                <dl className={styles.metrics}>
                  {sheet.metrics.map((metric) => (
                    <div key={metric.id}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>
                  ))}
                </dl>
              </Section>
            ) : null}
          </aside>
        </div>

        <script dangerouslySetInnerHTML={{ __html: ONE_SHEET_PRINT_OPTIMIZER_SCRIPT }} />

        <footer className={styles.footer}>
          <span>{sheet.identity.name}</span>
          <span>AIDENTITY · ONE-SHEET</span>
        </footer>
      </article>
    </main>
  );
}
