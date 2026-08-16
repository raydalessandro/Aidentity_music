// La navigazione dell'anteprima, costruita con la stessa regola del sito pubblicato.
//
// L'anteprima non è una copia del sito: è il sito, servito con un'autorizzazione diversa.
// Quindi le superfici, le etichette e le regole su cosa è raggiungibile devono nascere da
// un posto solo — il contratto — e cambiare soltanto nell'indirizzo: `/nome-artista/feed`
// per chi visita, `/app/wizard/preview/<id>/feed` per l'owner, e la stessa forma per il
// link a scadenza.
//
// Questo repository ha già pagato due volte la regola scritta due volte: il dock che
// puntava ad ancore su un sito pubblicato (#26) e la ribbon che divergeva fra anteprima e
// pubblicato (#36). In entrambi i casi a scoprirlo sarebbe stato l'artista.

import type { ShellSurfaceId } from "../../components/site-shell/types";
import type { SiteTemplateNavItem } from "../../components/site-templates/types";
import type { SiteConfigDraft } from "../contract";

/** Le superfici che hanno una pagina propria, oltre alla HOME. */
export const PREVIEW_SURFACES = ["feed", "listen", "epk", "merch"] as const;
export type PreviewSurface = (typeof PREVIEW_SURFACES)[number];

const DOCK_ORDER: readonly ShellSurfaceId[] = ["feed", "listen", "epk", "merch", "home"];

/** Etichette di riserva, identiche a quelle del read model pubblico. */
const DEFAULT_LABEL: Readonly<Record<ShellSurfaceId, string>> = {
  feed: "FEED",
  listen: "LISTEN",
  epk: "EPK",
  merch: "MERCH",
  home: "HOME",
};

export function isPreviewSurface(value: string): value is PreviewSurface {
  return (PREVIEW_SURFACES as readonly string[]).includes(value);
}

/** L'etichetta che l'artista ha scritto, oppure il nome canonico della superficie. */
export function previewLabel(config: SiteConfigDraft, surface: ShellSurfaceId): string {
  return config.sectionCopy[surface]?.trim() || DEFAULT_LABEL[surface];
}

/**
 * `base` è la radice dell'anteprima — per esempio `/app/wizard/preview/<siteId>`. La HOME
 * è la radice stessa: è una superficie fra le altre, non l'intestazione fissa di tutte.
 */
export function previewHrefs(base: string): Readonly<Record<ShellSurfaceId, string>> {
  return {
    feed: `${base}/feed`,
    listen: `${base}/listen`,
    epk: `${base}/epk`,
    merch: `${base}/merch`,
    home: base,
  };
}

export function isSurfaceEnabled(config: SiteConfigDraft, surface: ShellSurfaceId): boolean {
  return config.surfaces.some((entry) => entry.id === surface && entry.enabled);
}

export function previewNavigation(
  config: SiteConfigDraft,
  base: string,
): readonly SiteTemplateNavItem[] {
  const hrefs = previewHrefs(base);
  return DOCK_ORDER.map((surface) => ({
    id: surface,
    enabled: isSurfaceEnabled(config, surface),
    label: previewLabel(config, surface),
    href: hrefs[surface],
  }));
}
