import type { CSSProperties } from "react";

import type { ShellPalette } from "../../components/site-shell/palettes";

/**
 * Variabili CSS del tema per i contenitori che non sono `SiteShell`.
 *
 * `components/site-shell/SiteShell.tsx` ha una funzione equivalente ma **privata**
 * (`paletteVars`, non esportata). Non modifico il filone A per esportarla: la scrivo qui,
 * nel mio perimetro, e chiedo nel report che sia A a esporla, così questa sparisce.
 * Le variabili e i loro nomi restano quelli di `app/globals.css`, che è di A.
 */
export function paletteStyle(palette: ShellPalette): CSSProperties {
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

export const PALETTE_CSS_VARIABLES: readonly string[] = [
  "--ink",
  "--panel",
  "--paper",
  "--muted",
  "--dim",
  "--line",
  "--acid",
  "--acid-ink",
];
