import type { CSSProperties } from "react";

import { shellPalettes, type ShellPalette } from "../../components/site-shell/palettes";
import type { SiteConfigDraft } from "../contract";

export function themeFromPalette(palette: ShellPalette): SiteConfigDraft["theme"] {
  return {
    ink: palette.ink,
    panel: palette.panel,
    paper: palette.paper,
    muted: palette.muted,
    dim: palette.dim,
    line: palette.line,
    acid: palette.acid,
  };
}

type Rgb = readonly [number, number, number];

function hexToRgb(value: string): Rgb {
  const digits = value.slice(1);
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(value: string): number {
  const [red, green, blue] = hexToRgb(value);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readableInkOn(acid: string, candidates: readonly string[]): string {
  return candidates.reduce((best, candidate) =>
    contrast(candidate, acid) > contrast(best, acid) ? candidate : best,
  candidates[0] ?? "#000000");
}

/**
 * La preview deve usare i sette token reali della config, esattamente come il
 * renderer D. I preset servono soltanto come metadati/id diagnostici: non devono
 * sostituire un tema custom valido con i propri colori.
 */
const THEME_TOKENS = ["ink", "panel", "paper", "muted", "dim", "line", "acid"] as const;

function tokenDistance(preset: ShellPalette, theme: SiteConfigDraft["theme"]): number {
  let total = 0;
  for (const token of THEME_TOKENS) {
    const [pr, pg, pb] = hexToRgb(preset[token]);
    const [tr, tg, tb] = hexToRgb(theme[token]);
    total += (pr - tr) ** 2 + (pg - tg) ** 2 + (pb - tb) ** 2;
  }
  return total;
}

/** Stessa scelta metadata di D (`resolvePalette`): colori reali, id del preset più vicino. */
export function paletteForDraft(config: SiteConfigDraft): ShellPalette {
  let metadata = shellPalettes[0]!;
  let distance = tokenDistance(metadata, config.theme);
  for (const preset of shellPalettes.slice(1)) {
    const candidate = tokenDistance(preset, config.theme);
    if (candidate < distance) {
      metadata = preset;
      distance = candidate;
    }
  }

  return {
    id: metadata.id,
    label: distance === 0 ? metadata.label : "Personalizzata",
    ...config.theme,
    acidInk: readableInkOn(config.theme.acid, [
      config.theme.ink,
      config.theme.paper,
      "#000000",
      "#FFFFFF",
    ]),
  };
}

export function paletteStyleForDraft(config: SiteConfigDraft): CSSProperties {
  const palette = paletteForDraft(config);
  return {
    "--ink": palette.ink,
    "--panel": palette.panel,
    "--paper": palette.paper,
    "--muted": palette.muted,
    "--dim": palette.dim,
    "--line": palette.line,
    "--acid": palette.acid,
    "--acid-ink": palette.acidInk,
    background: palette.paper,
    color: palette.ink,
    minHeight: "100vh",
  } as CSSProperties;
}
