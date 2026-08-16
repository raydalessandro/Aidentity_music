import type { CSSProperties } from "react";

import type { ShellPalette } from "./palettes";

/**
 * Unica traduzione dei token tema nelle custom properties consumate dal guscio visuale.
 *
 * Prima esisteva due volte: privata dentro `SiteShell.tsx` e ricopiata in
 * `app/[slug]/theme.ts`, con un commento che chiedeva esplicitamente di esportarla per far
 * sparire il duplicato. Ora il duplicato è sparito: i nomi delle variabili restano quelli di
 * `app/globals.css`, che è l'unica sorgente del design.
 */
export function paletteVars(palette: ShellPalette): CSSProperties {
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
