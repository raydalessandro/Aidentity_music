// PORTA DEL RENDERER — confine architetturale del filone D, non un segnaposto.
//
// Decisione di Ray (stop a): `SiteReader` appartiene al filone D in via definitiva.
// È il consumatore a definire la porta; il filone B fornisce l'adattatore che la implementa.
// Il vincolo vale anche dopo il merge di B: **nessun file sotto `app/[slug]/**` importa mai
// il client Supabase**. Qui dentro non esiste alcuna dipendenza da `lib/supabase/**`, e
// `no-supabase-import.test.ts` fallisce se qualcuno ne introduce una.
//
// I metodi sono per superficie, non per tabella: il renderer chiede "cosa serve a LISTEN",
// non "fai una select su site_tracks". Quante query servano è un problema dell'adattatore.
//
// STOP (b): le sole proiezioni pubbliche esistenti sono `public_sites` e `public_tracks`
// (migrazione PR-0, righe 262-263). Ogni forma marcata MANCANTE richiede una vista che oggi
// non esiste; crearla non è nel perimetro del filone D.

/** Colonne di `public_sites`. `config` è jsonb non fidato: passa da `siteConfigSchema`. */
export type PublicSiteRow = {
  readonly id: string;
  readonly slug: string;
  readonly config: unknown;
  readonly hero_asset_id: string | null;
  /** MANCANTE: l'hero risolto in immagine pubblica. Vedi `PublicAssetRow`. */
  readonly hero?: PublicAssetRow | null;
};

/** Riga minima per la sitemap: lo slug più la config che dice quali superfici esistono. */
export type PublishedSiteIndexRow = Pick<PublicSiteRow, "id" | "slug" | "config">;

export type EmbedProvider = "spotify" | "apple_music" | "youtube" | "soundcloud";

/** Colonne di `public_tracks`: nessun `storage_path`, nessun byte, nessun `purged_at`. */
export type PublicTrackRow = {
  readonly id: string;
  readonly site_id: string;
  readonly title: string;
  readonly source: "upload" | "embed";
  readonly duration_seconds: number | null;
  readonly embed_provider: EmbedProvider | null;
  readonly embed_url: string | null;
  readonly sort_order: number;
  /**
   * MANCANTE in `public_tracks`: una traccia `upload` non ha oggi alcun riferimento audio
   * pubblico, e il path privato dello Storage non può entrare in una proiezione anonima.
   * Finché il campo non esiste il read model scarta gli upload con `upload-source-missing`
   * invece di rendere un player senza sorgente.
   */
  readonly audio_url?: string | null;
};

/**
 * MANCANTE: proiezione pubblica di `site_assets`.
 * Pubbliche: `id`, `kind`, `sort_order` e un riferimento pubblico al file.
 * Interne da escludere: `storage_path`, `byte_size`, `mime_type`, `purged_at`
 * (che diventa un filtro `purged_at is null`, non una colonna).
 */
export type PublicAssetRow = {
  readonly id: string;
  readonly site_id: string;
  readonly kind: "logo" | "visual" | "photo_hi" | "merch" | "video";
  /** URL pubblico o firmato prodotto dal server: mai il path privato. */
  readonly public_url: string;
  readonly alt: string | null;
  readonly sort_order: number;
};

/** MANCANTE: proiezione pubblica di `site_posts`. */
export type PublicPostRow = {
  readonly id: string;
  readonly site_id: string;
  readonly kind: "visual" | "track";
  readonly caption: string | null;
  readonly visual_asset_id: string | null;
  readonly cover_asset_id: string | null;
  readonly track_id: string | null;
  readonly sort_order: number;
};

/** MANCANTE: proiezione pubblica di `site_links`. */
export type PublicLinkRow = {
  readonly id: string;
  readonly site_id: string;
  readonly provider:
    | "spotify"
    | "apple_music"
    | "youtube"
    | "soundcloud"
    | "instagram"
    | "tiktok";
  readonly url: string;
  readonly sort_order: number;
};

/** MANCANTE: proiezione pubblica di `site_press`. */
export type PublicPressRow = {
  readonly id: string;
  readonly site_id: string;
  readonly publication: string;
  readonly quote: string;
  readonly published_on: string | null;
  readonly url: string | null;
  readonly sort_order: number;
};

/** MANCANTE: proiezione pubblica di `site_dates`. */
export type PublicDateRow = {
  readonly id: string;
  readonly site_id: string;
  readonly starts_at: string;
  readonly city: string;
  readonly venue: string;
  readonly ticket_url: string | null;
  readonly sort_order: number;
};

/** MANCANTE: proiezione pubblica di `site_metrics`. */
export type PublicMetricRow = {
  readonly id: string;
  readonly site_id: string;
  readonly label: string;
  readonly value: string;
  readonly sort_order: number;
};

/**
 * MANCANTE: proiezione pubblica di `site_contacts`.
 * La vista deve filtrare `consent_confirmed_at is not null` ed escludere sia il timestamp
 * sia `consent_confirmed_by`: il consenso è un dato interno e la sua assenza è un divieto.
 */
export type PublicContactRow = {
  readonly id: string;
  readonly site_id: string;
  readonly role: "booking" | "management" | "press";
  readonly name: string;
  readonly email: string;
  readonly sort_order: number;
};

/** Materiale della superficie LISTEN. Disponibile oggi tramite `public_tracks`. */
export type ListenRecords = {
  readonly tracks: readonly PublicTrackRow[];
};

/** Materiale della superficie FEED. MANCANTE per intero. */
export type FeedRecords = {
  readonly posts: readonly PublicPostRow[];
  /** Asset referenziati dai post, già risolti in URL pubblici. */
  readonly assets: readonly PublicAssetRow[];
};

/** Materiale della superficie EPK. Bio e identità arrivano dalla config, il resto è MANCANTE. */
export type EpkRecords = {
  readonly links: readonly PublicLinkRow[];
  readonly press: readonly PublicPressRow[];
  readonly dates: readonly PublicDateRow[];
  readonly metrics: readonly PublicMetricRow[];
  /** Solo contatti con consenso confermato: la vista non deve poterne restituire altri. */
  readonly contacts: readonly PublicContactRow[];
  /** Foto ad alta risoluzione del kit stampa (`kind = 'photo_hi'`). */
  readonly photoKit: readonly PublicAssetRow[];
};

/** Materiale della superficie MERCH: render dichiarati come tali, senza acquisto. */
export type MerchRecords = {
  readonly items: readonly PublicAssetRow[];
};

/**
 * Porta di lettura del renderer. Ogni metodo restituisce soltanto dati di siti `published`:
 * il filtro appartiene alla proiezione, non al chiamante. Nessun metodo espone owner,
 * consenso, billing, usage, path privati, byte o metadati interni.
 */
export interface SiteReader {
  /** Il sito pubblicato con questo slug, o `null` per draft, pending, suspended e inesistenti. */
  findPublishedSite(slug: string): Promise<PublicSiteRow | null>;
  /** Tutti i siti pubblicati: alimenta la sitemap. */
  listPublishedSites(): Promise<readonly PublishedSiteIndexRow[]>;
  /** Catalogo misto upload/embed della superficie LISTEN. */
  loadListen(siteId: string): Promise<ListenRecords>;
  /** Post e immagini della superficie FEED. */
  loadFeed(siteId: string): Promise<FeedRecords>;
  /** Contatti consentiti, link, press, date, numeri e kit foto della superficie EPK. */
  loadEpk(siteId: string): Promise<EpkRecords>;
  /** Render della superficie MERCH. */
  loadMerch(siteId: string): Promise<MerchRecords>;
}

export const EMPTY_LISTEN: ListenRecords = { tracks: [] };
export const EMPTY_FEED: FeedRecords = { posts: [], assets: [] };
export const EMPTY_EPK: EpkRecords = {
  links: [],
  press: [],
  dates: [],
  metrics: [],
  contacts: [],
  photoKit: [],
};
export const EMPTY_MERCH: MerchRecords = { items: [] };

/**
 * Lettore neutro: nessun sito risolve, ogni slug produce `not-published`.
 * Non finge dati e non finge un client. È l'implementazione attiva finché il bordo di
 * composizione non riceve l'adattatore del filone B.
 */
export const unconfiguredSiteReader: SiteReader = {
  findPublishedSite: async () => null,
  listPublishedSites: async () => [],
  loadListen: async () => EMPTY_LISTEN,
  loadFeed: async () => EMPTY_FEED,
  loadEpk: async () => EMPTY_EPK,
  loadMerch: async () => EMPTY_MERCH,
};
