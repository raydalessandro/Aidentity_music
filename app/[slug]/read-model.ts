// Read model del renderer multi-tenant: funzioni PURE dalle righe del database ai props.
// L'unico punto che tocca il lettore è `resolveSite`, tenuto volutamente sottile.
// La validazione passa da `siteConfigSchema` di lib/contract.ts: nessuna validazione parallela.

import type { SiteConfig } from "../../lib/contract";
import { siteConfigSchema } from "../../lib/contract";
import { shellPalettes, type ShellPalette } from "../../components/site-shell/palettes";
import { classifySlug } from "./slug";
import type { EmbedProvider, PublicSiteRow, PublicTrackRow, SiteReader } from "./site-reader";

export type SurfaceId = SiteConfig["surfaces"][number]["id"];

/** Ordine canonico del dock (L0.7 §2): FEED LISTEN [EPK] MERCH HOME. */
export const SURFACE_ORDER: readonly SurfaceId[] = ["feed", "listen", "epk", "merch", "home"];

/** Superfici non spegnibili (L0.7 C6). */
export const ALWAYS_ON_SURFACES: readonly SurfaceId[] = ["home", "epk"];

const DEFAULT_SURFACE_LABEL: Readonly<Record<SurfaceId, string>> = {
  feed: "FEED",
  listen: "LISTEN",
  epk: "EPK",
  merch: "MERCH",
  home: "HOME",
};

// ---------------------------------------------------------------- configurazione

/**
 * `siteConfigSchema` garantisce a runtime che l'identità sia completa, ma il tipo inferito
 * resta nullable perché il controllo vive in un `superRefine`. Questa forma è la stessa
 * config dopo il restringimento: serve a non scrivere un cast a valle.
 */
export type PublishedIdentity = {
  readonly name: string;
  readonly handle: string;
  readonly claim: string;
  readonly shortBio: string;
  readonly longBio: string;
  readonly location: string;
  readonly locale: "it-IT";
};

export type PublishableConfig = Omit<SiteConfig, "identity"> & {
  readonly identity: PublishedIdentity;
};

function narrowIdentity(identity: SiteConfig["identity"]): PublishedIdentity | null {
  const { name, handle, claim, shortBio, longBio, location, locale } = identity;
  if (
    name === null ||
    handle === null ||
    claim === null ||
    shortBio === null ||
    longBio === null ||
    location === null
  ) {
    return null;
  }
  return { name, handle, claim, shortBio, longBio, location, locale };
}

export type ConfigResult =
  | { readonly ok: true; readonly config: PublishableConfig }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Una config che non è pubblicabile non diventa mai props. */
export function parseSiteConfig(value: unknown): ConfigResult {
  const parsed = siteConfigSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  }

  const identity = narrowIdentity(parsed.data.identity);
  // Ramo di coerenza dei tipi: `siteConfigSchema` esclude già questo caso a runtime.
  // Esiste per non introdurre un cast, non per validare una seconda volta.
  if (identity === null) {
    return { ok: false, issues: ["identity: identità incompleta accettata dallo schema"] };
  }

  return { ok: true, config: { ...parsed.data, identity } };
}

// ---------------------------------------------------------------- palette

type Rgb = readonly [number, number, number];

export function hexToRgb(value: string): Rgb {
  const digits = value.replace("#", "");
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

export function relativeLuminance(color: string): number {
  const [red, green, blue] = hexToRgb(color);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Il testo sopra l'acid non è configurabile: si sceglie il candidato che legge meglio. */
export function readableInkOn(background: string, candidates: readonly string[]): string {
  let best = "#000000";
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

const PALETTE_TOKENS = ["ink", "panel", "paper", "muted", "dim", "line", "acid"] as const;

function tokenDistance(preset: ShellPalette, theme: SiteConfig["theme"]): number {
  let total = 0;
  for (const token of PALETTE_TOKENS) {
    const [pr, pg, pb] = hexToRgb(preset[token]);
    const [tr, tg, tb] = hexToRgb(theme[token]);
    total += (pr - tr) ** 2 + (pg - tg) ** 2 + (pb - tb) ** 2;
  }
  return total;
}

function nearestPreset(theme: SiteConfig["theme"]): { preset: ShellPalette; distance: number } {
  let best: { preset: ShellPalette; distance: number } | null = null;
  for (const preset of shellPalettes) {
    const distance = tokenDistance(preset, theme);
    if (best === null || distance < best.distance) best = { preset, distance };
  }
  if (best === null) throw new Error("Il filone A non dichiara nessuna palette.");
  return best;
}

/**
 * I sette token della config sono l'unica sorgente dei colori resi.
 * `id` e `label` restano metadati diagnostici del filone A: `PaletteId` è un vocabolario
 * chiuso di quattro preset, quindi un tema che non coincide con nessuno di essi eredita
 * l'identificativo del preset più vicino. Vedi il report, "attriti con il filone A".
 */
export function resolvePalette(theme: SiteConfig["theme"]): ShellPalette {
  const { preset, distance } = nearestPreset(theme);
  return {
    id: preset.id,
    label: distance === 0 ? preset.label : "Personalizzata",
    ink: theme.ink,
    panel: theme.panel,
    paper: theme.paper,
    muted: theme.muted,
    dim: theme.dim,
    line: theme.line,
    acid: theme.acid,
    acidInk: readableInkOn(theme.acid, [theme.ink, theme.paper, "#000000", "#FFFFFF"]),
  };
}

// ---------------------------------------------------------------- superfici

export type SurfaceView = {
  readonly id: SurfaceId;
  readonly enabled: boolean;
  readonly label: string;
  readonly href: string;
};

export function surfaceHref(slug: string, surface: SurfaceId): string {
  return surface === "home" ? `/${slug}` : `/${slug}/${surface}`;
}

export function buildSurfaces(config: SiteConfig, slug: string): readonly SurfaceView[] {
  return SURFACE_ORDER.map((id) => {
    const declared = config.surfaces.find((surface) => surface.id === id);
    return {
      id,
      enabled: declared?.enabled ?? false,
      label: config.sectionCopy[id]?.trim() || DEFAULT_SURFACE_LABEL[id],
      href: surfaceHref(slug, id),
    };
  });
}

/**
 * Una superficie spenta non è raggiungibile, non soltanto nascosta dal dock:
 * chi riceve `false` produce un 404, non una pagina vuota.
 */
export function isSurfaceReachable(config: SiteConfig, surface: SurfaceId): boolean {
  if (ALWAYS_ON_SURFACES.includes(surface)) return true;
  return config.surfaces.some((declared) => declared.id === surface && declared.enabled);
}

// ---------------------------------------------------------------- vista del sito

export type SiteView = {
  readonly id: string;
  readonly slug: string;
  readonly config: PublishableConfig;
  readonly palette: ShellPalette;
  readonly surfaces: readonly SurfaceView[];
  readonly heroAssetId: string | null;
};

export type SiteViewResult =
  | { readonly status: "ok"; readonly site: SiteView }
  | { readonly status: "config-invalid"; readonly slug: string; readonly issues: readonly string[] };

export function buildSiteView(row: PublicSiteRow): SiteViewResult {
  const parsed = parseSiteConfig(row.config);
  if (!parsed.ok) return { status: "config-invalid", slug: row.slug, issues: parsed.issues };

  return {
    status: "ok",
    site: {
      id: row.id,
      slug: row.slug,
      config: parsed.config,
      palette: resolvePalette(parsed.config.theme),
      surfaces: buildSurfaces(parsed.config, row.slug),
      heroAssetId: row.hero_asset_id,
    },
  };
}

export type SiteResolution =
  | { readonly status: "ok"; readonly site: SiteView }
  | { readonly status: "malformed-slug"; readonly slug: string }
  | { readonly status: "reserved-slug"; readonly slug: string }
  | { readonly status: "not-published"; readonly slug: string }
  | { readonly status: "config-invalid"; readonly slug: string; readonly issues: readonly string[] };

/**
 * Unico ingresso del renderer. Uno slug riservato o malformato non tocca il lettore:
 * il database non viene nemmeno interrogato.
 */
export async function resolveSite(slug: string, reader: SiteReader): Promise<SiteResolution> {
  const verdict = classifySlug(slug);
  if (verdict.kind === "malformed") return { status: "malformed-slug", slug };
  if (verdict.kind === "reserved") return { status: "reserved-slug", slug };

  const row = await reader.findPublishedSite(verdict.slug);
  if (row === null) return { status: "not-published", slug };

  return buildSiteView(row);
}

// ---------------------------------------------------------------- tracce

export type TrackView =
  | {
      readonly kind: "upload";
      readonly id: string;
      readonly title: string;
      readonly durationSeconds: number | null;
      readonly src: string;
    }
  | {
      readonly kind: "embed";
      readonly id: string;
      readonly title: string;
      readonly provider: EmbedProvider;
      readonly url: string;
    };

export type RejectedTrackReason =
  | "upload-source-missing"
  | "embed-incomplete"
  | "embed-host-not-allowed";

export type RejectedTrack = {
  readonly id: string;
  readonly title: string;
  readonly reason: RejectedTrackReason;
};

export type ListenView = {
  readonly tracks: readonly TrackView[];
  readonly rejected: readonly RejectedTrack[];
};

/**
 * Una riga incoerente non diventa un player rotto: viene scartata con una ragione esplicita.
 * `isAllowedEmbed` arriva da ./embed, che rispecchia l'allowlist della migrazione PR-0.
 */
export function buildListenView(
  rows: readonly PublicTrackRow[],
  isAllowedEmbed: (provider: EmbedProvider, url: string) => boolean,
): ListenView {
  const tracks: TrackView[] = [];
  const rejected: RejectedTrack[] = [];

  for (const row of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
    if (row.source === "upload") {
      const src = row.audio_url ?? "";
      if (src.trim() === "") {
        rejected.push({ id: row.id, title: row.title, reason: "upload-source-missing" });
        continue;
      }
      tracks.push({
        kind: "upload",
        id: row.id,
        title: row.title,
        durationSeconds: row.duration_seconds,
        src,
      });
      continue;
    }

    if (row.embed_provider === null || row.embed_url === null) {
      rejected.push({ id: row.id, title: row.title, reason: "embed-incomplete" });
      continue;
    }
    if (!isAllowedEmbed(row.embed_provider, row.embed_url)) {
      rejected.push({ id: row.id, title: row.title, reason: "embed-host-not-allowed" });
      continue;
    }
    tracks.push({
      kind: "embed",
      id: row.id,
      title: row.title,
      provider: row.embed_provider,
      url: row.embed_url,
    });
  }

  return { tracks, rejected };
}
