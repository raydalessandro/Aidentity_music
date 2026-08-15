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

/**
 * Lo stato del bordo vive nel registro globale dei simboli, non in una variabile di modulo.
 *
 * Non è una preferenza stilistica: è una misura. Su Next 16.3.1 con Turbopack
 * (`next build && next start`), `instrumentation.ts` e le route dell'app router caricano
 * **due istanze distinte di questo stesso modulo dentro lo stesso processo** — misurato con
 * un identificativo casuale per istanza e `process.pid`: pid `18380` per entrambe, istanze
 * `li4uwy` (instrumentation) e `q1ssel` (tutte le route, `/[slug]`, `/[slug]/epk`,
 * `/[slug]/listen`). Tutte le route condividono un'istanza; l'instrumentation ha la sua.
 *
 * Con una variabile di modulo, `configureSiteReader` scriveva nell'istanza
 * dell'instrumentation e `siteReader()` leggeva quella delle route: l'adattatore risultava
 * registrato (`registered: true`, query reale verso PostgREST) e ogni slug rispondeva
 * comunque **404**. Il registro globale è per realm, quindi le due istanze vedono lo stesso
 * riferimento e il bordo torna a essere uno solo.
 *
 * L'API pubblica non cambia; `composition.test.ts` continua a valere parola per parola.
 */
type ReaderSlot = { reader: SiteReader | null };

const SLOT_KEY = Symbol.for("aidentity.site-reader");
const globalSlots = globalThis as unknown as Record<symbol, ReaderSlot | undefined>;

function slot(): ReaderSlot {
  const existing = globalSlots[SLOT_KEY];
  if (existing !== undefined) return existing;
  const created: ReaderSlot = { reader: null };
  globalSlots[SLOT_KEY] = created;
  return created;
}

/** Iniezione esplicita, da chiamare una sola volta all'avvio, fuori da `app/[slug]/**`. */
export function configureSiteReader(reader: SiteReader): void {
  slot().reader = reader;
}

/** Ripristina il lettore neutro. Serve ai test, non al prodotto. */
export function resetSiteReader(): void {
  slot().reader = null;
}

export function isSiteReaderConfigured(): boolean {
  return slot().reader !== null;
}

export function siteReader(): SiteReader {
  return slot().reader ?? unconfiguredSiteReader;
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
