import type { CSSProperties } from "react";

import type { ShellPalette } from "../../components/site-shell/palettes";
import { paletteVars } from "../../components/site-shell/style";

/**
 * Variabili CSS del tema per i contenitori che non sono `SiteShell`.
 *
 * Qui c'era una copia letterale della `paletteVars` privata di `SiteShell.tsx`, con la
 * richiesta scritta che il filone A la esportasse «così questa sparisce». Ora A la esporta
 * da `components/site-shell/style.ts` e la copia è sparita: resta il solo inoltro, perché il
 * nome `paletteStyle` è quello con cui il renderer di route chiama la traduzione.
 * Le variabili e i loro nomi restano quelli di `app/globals.css`.
 */
export function paletteStyle(palette: ShellPalette): CSSProperties {
  return paletteVars(palette);
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
