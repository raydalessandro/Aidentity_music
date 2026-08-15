// SEO per sito: funzioni PURE. Nessuna lettura di process.env, nessun I/O.
// L'URL base arriva sempre come parametro da lib/base-url.ts.

import type { Metadata, MetadataRoute } from "next";

import type { PublishedSiteIndexRow } from "./site-reader";
import {
  SURFACE_ORDER,
  buildSurfaces,
  parseSiteConfig,
  surfaceHref,
  type SiteView,
  type SurfaceId,
  type TrackView,
} from "./read-model";

/**
 * Metadata di un sito o di una superficie non risolvibili. Non distingue fra slug riservato,
 * sito inesistente, sito non pubblicato e superficie spenta: la risposta pubblica è una sola.
 */
export const UNAVAILABLE_METADATA: Metadata = {
  title: "Sito non disponibile",
  robots: { index: false, follow: false },
};

const SURFACE_TITLE: Readonly<Record<SurfaceId, string>> = {
  home: "",
  feed: "Feed",
  listen: "Ascolta",
  epk: "EPK",
  merch: "Merch",
};

function canonical(baseUrl: string, slug: string, surface: SurfaceId): string {
  return `${baseUrl}${surfaceHref(slug, surface)}`;
}

/** Titolo e descrizione derivano soltanto dall'identità della config: nessun testo inventato. */
export function buildSurfaceMetadata(
  site: SiteView,
  surface: SurfaceId,
  baseUrl: string,
): Metadata {
  const { identity } = site.config;
  const surfaceLabel =
    site.config.sectionCopy[surface]?.trim() || SURFACE_TITLE[surface];
  const title = surfaceLabel === "" ? identity.name : `${identity.name} — ${surfaceLabel}`;
  const url = canonical(baseUrl, site.slug, surface);

  return {
    title,
    description: identity.shortBio,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description: identity.shortBio,
      url,
      siteName: identity.name,
      locale: identity.locale.replace("-", "_"),
    },
    robots: { index: true, follow: true },
  };
}

export type MusicGroupJsonLd = {
  readonly "@context": "https://schema.org";
  readonly "@type": "MusicGroup";
  readonly name: string;
  readonly alternateName: string;
  readonly url: string;
  readonly description: string;
  readonly foundingLocation: { readonly "@type": "Place"; readonly name: string };
  readonly sameAs: readonly string[];
  readonly track: readonly {
    readonly "@type": "MusicRecording";
    readonly name: string;
    readonly duration?: string;
  }[];
};

function isoDuration(seconds: number | null): string | undefined {
  if (seconds === null || seconds <= 0) return undefined;
  return `PT${Math.floor(seconds / 60)}M${seconds % 60}S`;
}

/**
 * schema.org MusicGroup del sito.
 * `sameAs` resta vuoto finché non esiste una proiezione pubblica di `site_links`:
 * meglio un campo assente che un campo inventato.
 */
export function buildMusicGroupJsonLd(
  site: SiteView,
  baseUrl: string,
  options: { readonly sameAs?: readonly string[]; readonly tracks?: readonly TrackView[] } = {},
): MusicGroupJsonLd {
  const { identity } = site.config;
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: identity.name,
    alternateName: `@${identity.handle}`,
    url: canonical(baseUrl, site.slug, "home"),
    description: identity.longBio,
    foundingLocation: { "@type": "Place", name: identity.location },
    sameAs: options.sameAs ?? [],
    track: (options.tracks ?? []).map((track) => {
      const duration = track.kind === "upload" ? isoDuration(track.durationSeconds) : undefined;
      return duration === undefined
        ? { "@type": "MusicRecording" as const, name: track.title }
        : { "@type": "MusicRecording" as const, name: track.title, duration };
    }),
  };
}

/**
 * Serializzazione sicura del JSON-LD: `<` è neutralizzato perché il contenuto arriva dal
 * database e finisce dentro un elemento `script`, dove `</script>` chiuderebbe il blocco.
 */
export function jsonLdScriptContent(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * La sitemap è parametrica quanto il renderer: una superficie spenta non compare.
 * Un sito la cui config non è pubblicabile viene saltato per intero.
 */
export function buildSitemapEntries(
  rows: readonly PublishedSiteIndexRow[],
  baseUrl: string,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const row of rows) {
    const parsed = parseSiteConfig(row.config);
    if (!parsed.ok) continue;

    for (const surface of buildSurfaces(parsed.config, row.slug)) {
      if (!surface.enabled) continue;
      entries.push({
        url: `${baseUrl}${surface.href}`,
        changeFrequency: surface.id === "feed" ? "weekly" : "monthly",
        priority: surface.id === "home" ? 1 : surface.id === "epk" ? 0.8 : 0.5,
      });
    }
  }

  return entries;
}

/** Aree applicative che non sono siti di clienti e non vanno indicizzate. */
export const PRIVATE_PATHS: readonly string[] = [
  "/_next/",
  "/api/",
  "/admin",
  "/app/",
  "/auth/",
  "/login",
  "/preview/",
];

export function buildRobots(baseUrl: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

/** Elenco ordinato delle superfici, usato dai test di parametricità e dalla sitemap. */
export const SURFACES_FOR_SEO = SURFACE_ORDER;
