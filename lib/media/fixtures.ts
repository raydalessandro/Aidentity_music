// Banco di prova del filone media. Non è codice di prodotto: nessuna route lo importa.
//
// La fixture imita le **tabelle**, non una query già filtrata. È la differenza che rende
// utile tutto il resto: il doppio restituisce volentieri la riga di un sito in bozza, di un
// altro tenant o purgata, esattamente come farebbe una lettura con `service_role`. Se il
// controllo che le rifiuta sparisse dal codice, il test diventerebbe rosso invece di
// continuare a passare perché «tanto il doppio non le aveva».
//
// Gli identificativi ricalcano `supabase/seed.sql`, compreso il fatto che non sono UUID v4:
// `22222222-…` non rispetta versione e variante RFC 9562. Restano così apposta — il bordo
// deve accettarli con `z.guid()`, e chi tornasse a `z.uuid()` troverebbe questa fixture
// rossa immediatamente.

import type { MediaKind, MediaRow, PublicationStatus } from "./media";
import type {
  MediaObject,
  MediaObjectFetcher,
  MediaUrlSigner,
  PrivilegedMediaSource,
} from "./ports";

export const MEDIA_FIXTURE_IDS = {
  /** Sito pubblicato del seed. */
  publishedSite: "22222222-2222-2222-2222-222222222222",
  /** Sito in bozza del seed (owner B). */
  draftSite: "55555555-5555-5555-5555-555555555555",
  /** Sito in revisione del seed (owner C). */
  reviewSite: "88888888-8888-8888-8888-888888888888",

  /** Hero del sito pubblicato: il caso positivo. */
  publishedAsset: "33333333-3333-3333-3333-333333333333",
  /** Asset del sito pubblicato, purgato. */
  purgedAsset: "a1a1a1a1-0000-0000-0000-000000000002",
  /** Asset del sito in bozza: esiste, non deve essere ottenibile. */
  draftAsset: "66666666-6666-6666-6666-666666666666",
  /** Asset del sito in revisione. */
  reviewAsset: "a1a1a1a1-0000-0000-0000-000000000009",
  /** Asset con MIME non servibile: un SVG finito in tabella è XSS same-origin. */
  svgAsset: "a1a1a1a1-0000-0000-0000-00000000000f",

  /** Traccia `upload` del sito pubblicato: il caso positivo audio. */
  publishedTrack: "b1b1b1b1-0000-0000-0000-000000000001",
  /** Traccia `upload` purgata. */
  purgedTrack: "b1b1b1b1-0000-0000-0000-000000000002",
  /** Traccia `embed`: nessun file, `storage_path` è NULL per CHECK di PR-0. */
  embedTrack: "b1b1b1b1-0000-0000-0000-000000000003",
  /** Traccia del sito in bozza. */
  draftTrack: "b1b1b1b1-0000-0000-0000-00000000000b",

  /** Identificativo ben formato che non esiste in nessuna tabella. */
  absent: "deadbeef-0000-0000-0000-000000000000",
} as const;

/** I path della fixture: nessuno di questi deve mai comparire in una risposta. */
export const MEDIA_FIXTURE_PATHS = {
  publishedAsset: "seed/nvll-click-hero.jpg",
  purgedAsset: "test/a-purged.jpg",
  draftAsset: "seed/owner-b-hero.jpg",
  reviewAsset: "test/c-review.jpg",
  svgAsset: "test/a-vector.svg",
  publishedTrack: "test/a-track.mp3",
  purgedTrack: "test/a-purged.mp3",
  draftTrack: "test/b-track.mp3",
} as const;

export type FixtureEntry = MediaRow & { readonly kind: MediaKind; readonly id: string };

function assetRow(
  id: string,
  siteId: string,
  status: PublicationStatus,
  storagePath: string,
  options: { readonly mimeType?: string; readonly purgedAt?: string | null } = {},
): FixtureEntry {
  return {
    kind: "asset",
    id,
    siteId,
    storagePath,
    mimeType: options.mimeType ?? "image/jpeg",
    purgedAt: options.purgedAt ?? null,
    publicationStatus: status,
  };
}

function trackRow(
  id: string,
  siteId: string,
  status: PublicationStatus,
  storagePath: string | null,
  options: { readonly mimeType?: string | null; readonly purgedAt?: string | null } = {},
): FixtureEntry {
  return {
    kind: "track",
    id,
    siteId,
    storagePath,
    mimeType: options.mimeType === undefined ? "audio/mpeg" : options.mimeType,
    purgedAt: options.purgedAt ?? null,
    publicationStatus: status,
  };
}

const IDS = MEDIA_FIXTURE_IDS;
const PATHS = MEDIA_FIXTURE_PATHS;

export const MEDIA_FIXTURE_ROWS: readonly FixtureEntry[] = [
  assetRow(IDS.publishedAsset, IDS.publishedSite, "published", PATHS.publishedAsset),
  assetRow(IDS.purgedAsset, IDS.publishedSite, "published", PATHS.purgedAsset, {
    purgedAt: "2026-08-15T10:00:00Z",
  }),
  assetRow(IDS.svgAsset, IDS.publishedSite, "published", PATHS.svgAsset, {
    mimeType: "image/svg+xml",
  }),
  assetRow(IDS.draftAsset, IDS.draftSite, "draft", PATHS.draftAsset),
  assetRow(IDS.reviewAsset, IDS.reviewSite, "pending_review", PATHS.reviewAsset),

  trackRow(IDS.publishedTrack, IDS.publishedSite, "published", PATHS.publishedTrack),
  trackRow(IDS.purgedTrack, IDS.publishedSite, "published", PATHS.purgedTrack, {
    purgedAt: "2026-08-15T10:00:00Z",
  }),
  trackRow(IDS.embedTrack, IDS.publishedSite, "published", null, { mimeType: null }),
  trackRow(IDS.draftTrack, IDS.draftSite, "draft", PATHS.draftTrack),
];

/** La riga come la vede il lettore: `kind` e `id` sono chiavi della fixture, non colonne. */
export function mediaRowOf(entry: FixtureEntry): MediaRow {
  return {
    siteId: entry.siteId,
    storagePath: entry.storagePath,
    mimeType: entry.mimeType,
    purgedAt: entry.purgedAt,
    publicationStatus: entry.publicationStatus,
  };
}

/** Lettura per identificativo, come `service_role`: nessun filtro, nessuna cortesia. */
export function createFixtureMediaSource(
  options: { readonly failWith?: Error } = {},
): PrivilegedMediaSource & { readonly calls: { count: number } } {
  const calls = { count: 0 };
  return {
    calls,
    async findRow(kind: MediaKind, id: string): Promise<MediaRow | null> {
      calls.count += 1;
      if (options.failWith) throw options.failWith;
      const row = MEDIA_FIXTURE_ROWS.find((entry) => entry.kind === kind && entry.id === id);
      if (row === undefined) return null;
      return mediaRowOf(row);
    },
  };
}

/**
 * Firmatario che riproduce la forma vera di Supabase Storage, path incluso.
 *
 * È il punto della fixture: l'URL firmato **contiene** `storage_path`. Un test che
 * verifichi l'assenza del path nella risposta può quindi diventare rosso davvero — se la
 * route restituisse l'URL invece dei byte, il path comparirebbe e il test cadrebbe.
 */
export function createFixtureSigner(
  options: { readonly signedUrl?: string | null; readonly failWith?: Error } = {},
): MediaUrlSigner & { readonly issued: string[]; readonly ttls: number[] } {
  const issued: string[] = [];
  const ttls: number[] = [];
  return {
    issued,
    ttls,
    async sign(bucket: string, path: string, ttlSeconds: number): Promise<string | null> {
      if (options.failWith) throw options.failWith;
      ttls.push(ttlSeconds);
      if (options.signedUrl !== undefined) {
        if (options.signedUrl !== null) issued.push(options.signedUrl);
        return options.signedUrl;
      }
      const url = `https://storage.aidentity.test/storage/v1/object/sign/${bucket}/${path}?token=firma-di-prova`;
      issued.push(url);
      return url;
    },
  };
}

export const FIXTURE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

export function createFixtureFetcher(
  options: { readonly object?: MediaObject | null; readonly failWith?: Error } = {},
): MediaObjectFetcher & { readonly requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async fetchObject(signedUrl: string): Promise<MediaObject | null> {
      requested.push(signedUrl);
      if (options.failWith) throw options.failWith;
      if (options.object !== undefined) return options.object;
      return { bytes: FIXTURE_BYTES, contentType: "application/octet-stream" };
    },
  };
}
