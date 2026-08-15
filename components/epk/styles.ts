import type { CSSProperties } from "react";

/**
 * Stili dell'EPK, come oggetti `style` inline.
 *
 * Due vincoli li spiegano:
 *
 * 1. `app/globals.css` è del filone A e non si tocca; l'EPK deve poter essere
 *    montato ovunque senza portarsi dietro un foglio di stile.
 * 2. **Nessun colore letterale.** Ogni colore è una delle otto custom property
 *    che `SiteShell` inietta (`--ink`, `--panel`, `--paper`, `--muted`, `--dim`,
 *    `--line`, `--acid`, `--acid-ink`). Così le quattro palette funzionano per
 *    costruzione, e un test può leggere il markup e verificarlo.
 *
 * `--acid` compare solo come sfondo, sempre in coppia con `--acid-ink`: è
 * l'unica coppia con contrasto garantito dalle palette. Usato come colore del
 * testo su `--paper` scenderebbe sotto 4.5:1 (misurato: 3.03:1 su Ember).
 *
 * Per lo stesso motivo il testo secondario usa `--muted` e non `--dim`: su
 * Petal `--dim` sul proprio `--paper` misura 4.80:1, appena sopra la soglia.
 * Un margine di due centesimi non è un margine.
 */
export const styles = {
  root: {
    background: "var(--paper)",
    color: "var(--ink)",
    display: "grid",
    gap: "2rem",
    padding: "clamp(1rem, 4vw, 2.5rem)",
    lineHeight: 1.5,
  },
  section: {
    display: "grid",
    gap: "0.85rem",
    borderTop: "1px solid var(--line)",
    paddingTop: "1.1rem",
  },
  heading: {
    margin: 0,
    fontSize: "0.8125rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  subheading: {
    margin: 0,
    fontSize: "0.8125rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: "0.75rem",
  },
  inlineList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "0.75rem",
    padding: "0.9rem",
    display: "grid",
    gap: "0.4rem",
  },
  name: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 600,
  },
  meta: {
    margin: 0,
    fontSize: "0.8125rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  action: {
    background: "var(--acid)",
    color: "var(--acid-ink)",
    border: "1px solid var(--acid)",
    borderRadius: "0.5rem",
    padding: "0.7rem 0.9rem",
    fontSize: "1rem",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
    wordBreak: "break-word",
  },
  quietAction: {
    background: "var(--panel)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "0.5rem",
    padding: "0.6rem 0.85rem",
    fontSize: "0.9375rem",
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  },
  bio: {
    display: "grid",
    gap: "0.6rem",
  },
  bioText: {
    margin: 0,
    fontSize: "1rem",
    whiteSpace: "pre-line",
  },
  status: {
    margin: 0,
    minHeight: "1.4em",
    fontSize: "0.875rem",
    color: "var(--muted)",
  },
  quote: {
    margin: 0,
    display: "grid",
    gap: "0.4rem",
    borderLeft: "2px solid var(--acid)",
    paddingLeft: "0.85rem",
  },
  quoteText: {
    margin: 0,
    fontSize: "1rem",
  },
  source: {
    margin: 0,
    fontSize: "0.875rem",
    color: "var(--muted)",
  },
  dateRow: {
    display: "grid",
    gap: "0.3rem",
    borderBottom: "1px solid var(--line)",
    paddingBottom: "0.7rem",
  },
  when: {
    margin: 0,
    fontSize: "0.875rem",
    color: "var(--muted)",
  },
  where: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 600,
  },
  metrics: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
    gap: "0.9rem",
  },
  metricValue: {
    margin: 0,
    fontSize: "1.6rem",
    fontWeight: 700,
    lineHeight: 1.1,
  },
  metricLabel: {
    margin: 0,
    fontSize: "0.8125rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  link: {
    color: "var(--ink)",
    textDecorationColor: "var(--acid)",
    textUnderlineOffset: "0.2em",
  },
} as const satisfies Record<string, CSSProperties>;
