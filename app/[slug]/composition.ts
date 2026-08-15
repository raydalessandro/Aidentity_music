// BORDO DI COMPOSIZIONE — uno solo, visibile, e sta qui.
//
// È l'unico modulo del filone D che decide *quale* implementazione della porta `SiteReader`
// viene usata a runtime. Le route non conoscono nessuna implementazione: chiamano i loader
// di questo file. Nessun altro punto di `app/[slug]/**` può risolvere un lettore.
//
// L'adattatore del filone B viene iniettato da fuori con `configureSiteReader(...)`, perché
// `app/[slug]/**` non deve importare `lib/supabase/**` né ora né dopo il merge di B.
// Finché nessuno inietta nulla, resta attivo `unconfiguredSiteReader`: nessun sito risolve.

import { cache } from "react";

import { resolveSite, type SiteResolution } from "./read-model";
import {
  unconfiguredSiteReader,
  type EpkRecords,
  type FeedRecords,
  type ListenRecords,
  type MerchRecords,
  type PublishedSiteIndexRow,
  type SiteReader,
} from "./site-reader";

let configured: SiteReader | null = null;

/** Iniezione esplicita, da chiamare una sola volta all'avvio, fuori da `app/[slug]/**`. */
export function configureSiteReader(reader: SiteReader): void {
  configured = reader;
}

/** Ripristina il lettore neutro. Serve ai test, non al prodotto. */
export function resetSiteReader(): void {
  configured = null;
}

export function isSiteReaderConfigured(): boolean {
  return configured !== null;
}

export function siteReader(): SiteReader {
  return configured ?? unconfiguredSiteReader;
}

/** `cache` deduplica la risoluzione fra `generateMetadata` e il render della stessa richiesta. */
export const loadSite = cache(
  async (slug: string): Promise<SiteResolution> => resolveSite(slug, siteReader()),
);

export const loadPublishedSites = cache(
  async (): Promise<readonly PublishedSiteIndexRow[]> => siteReader().listPublishedSites(),
);

export const loadListen = cache(
  async (siteId: string): Promise<ListenRecords> => siteReader().loadListen(siteId),
);

export const loadFeed = cache(
  async (siteId: string): Promise<FeedRecords> => siteReader().loadFeed(siteId),
);

export const loadEpk = cache(
  async (siteId: string): Promise<EpkRecords> => siteReader().loadEpk(siteId),
);

export const loadMerch = cache(
  async (siteId: string): Promise<MerchRecords> => siteReader().loadMerch(siteId),
);
