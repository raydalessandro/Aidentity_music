import type { CSSProperties } from "react";

import { EpkSurface } from "../../../components/epk/EpkSurface";
import { fixtureContent, fixtureNow } from "../../../components/epk/fixture";
import { shellPalettes, type ShellPalette } from "../../../components/site-shell/palettes";

/**
 * Pagina diagnostica del filone E.
 *
 * Serve a una cosa sola: montare l'EPK su tutte e quattro le palette perché
 * axe e Playwright possano misurarlo davvero (`e2e/epk.spec.ts`). Non è una
 * superficie di prodotto e non appartiene al filone D.
 *
 * Le palette arrivano da `components/site-shell/palettes.ts` in sola lettura:
 * qui non si ridefinisce e non si ricopia nessun valore, si legge l'oggetto.
 * Se una palette cambia lì, questa pagina cambia con lei.
 *
 * La fixture contiene di proposito righe che devono essere rifiutate — su
 * tutte, il contatto senza `consent_confirmed_at`: il test verifica che non
 * esista nel DOM, per nome ed email precisi.
 */

function paletteVars(palette: ShellPalette): CSSProperties {
  return {
    "--ink": palette.ink,
    "--panel": palette.panel,
    "--paper": palette.paper,
    "--muted": palette.muted,
    "--dim": palette.dim,
    "--line": palette.line,
    "--acid": palette.acid,
    "--acid-ink": palette.acidInk,
  } as CSSProperties;
}

const [primaPalette] = shellPalettes;

export default function DiagnosticaEpk() {
  return (
    <main
      style={{
        ...(primaPalette === undefined ? {} : paletteVars(primaPalette)),
        background: "var(--paper)",
        color: "var(--ink)",
        display: "grid",
        gap: "2.5rem",
        padding: "clamp(1rem, 4vw, 2rem)",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", lineHeight: 1.2, letterSpacing: "normal", maxWidth: "none" }}>
        Filone E · EPK sulle quattro palette
      </h1>
      {shellPalettes.map((palette) => (
        <section
          key={palette.id}
          data-epk-palette={palette.id}
          aria-labelledby={`palette-${palette.id}`}
          style={{
            ...paletteVars(palette),
            background: "var(--paper)",
            color: "var(--ink)",
            border: "1px solid var(--line)",
          }}
        >
          <h2
            id={`palette-${palette.id}`}
            style={{
              margin: 0,
              padding: "0.75rem 1rem",
              borderBottom: "1px solid var(--line)",
              fontSize: "0.8125rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Palette {palette.label}
          </h2>
          <EpkSurface
            content={fixtureContent}
            now={fixtureNow}
            id={`epk-${palette.id}`}
            label={`EPK ${palette.label}`}
          />
        </section>
      ))}
    </main>
  );
}
