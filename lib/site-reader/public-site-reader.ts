// Adattatore: implementa la porta `SiteReader` del filone D leggendo le proiezioni
// pubbliche. Vive **fuori** da `app/[slug]/**` perché quel perimetro non deve importare
// il client Supabase né oggi né mai (decisione di Ray, presidiata da
// `app/[slug]/composition.test.ts`). La dipendenza va nel verso giusto: qui si importa il
// contratto del renderer, mai il contrario.
//
// Non conosce PostgREST: parla soltanto con `PublicRowSource`. Da questo discendono due
// cose pratiche — la mappatura è provabile con un doppio in memoria, senza database, e
// l'unico modulo che sa com'è fatta una catena `.from().select().eq()` è
// `postgrest-row-source.ts`, che si può sostituire senza toccare una riga di mappatura.
//
// ── La sorgente audio, e da dove arriva ───────────────────────────────────────────────
//
// `PublicTrackRow.audio_url` era il campo mancante che teneva LISTEN muto: `public_tracks`
// non espone `storage_path` e non deve, quindi il read model scartava ogni traccia `upload`
// con `upload-source-missing`. La route media esiste ora, e l'URL che la raggiunge non è un
// dato del database: è una funzione di `(site_id, id)`, cioè di due colonne già pubbliche.
//
// Si costruisce quindi qui, dopo la lettura, con `mediaUrl()` — un modulo senza import.
// Nessuna query cambia, nessuna colonna nuova viene chiesta, e il path privato resta dove
// sta. Chi decide se quel file è visibile non è questo adattatore: è la route, quando il
// browser chiede l'audio, e lo decide su `published`, tenant e `purged_at`.
//
// Le tracce `embed` non ricevono nulla: non hanno file, e §5 lo impone con un CHECK.
//
// ── Ciò che questo adattatore NON restituisce ancora ──────────────────────────────────
//
// `PublicAssetRow` pretende `public_url` e `alt`. La proiezione `public_assets` espone
// `id`, `site_id`, `kind`, `sort_order` e nient'altro; `alt` non esiste nemmeno come colonna
// in `site_assets`. L'URL ora saprei costruirlo — è lo stesso `mediaUrl()` con `kind`
// `asset` — ma `FeedRecords.assets`, `EpkRecords.photoKit` e `MerchRecords.items` sono
// consumati da `app/[slug]/surface-content.tsx`, che in questo momento è in mano a un altro
// filone. Restano vuoti e **nessuna query parte** verso `public_assets`: chiuderlo qui
// significherebbe scrivere metà di una superficie che sta cambiando altrove.

import {
  EMPTY_MERCH,
  type EpkRecords,
  type FeedRecords,
  type ListenRecords,
  type MerchRecords,
  type PublicSiteRow,
  type PublicTrackRow,
  type PublishedSiteIndexRow,
  type SiteReader,
} from "../../app/[slug]/site-reader";
import { mediaUrl } from "../media/url";
import type { PublicRelation, PublicRowSource } from "./row-source";
import {
  parseRows,
  publicContactContract,
  publicDateContract,
  publicLinkContract,
  publicMetricContract,
  publicPostContract,
  publicPressContract,
  publicSiteContract,
  publicTrackContract,
  publishedSiteIndexContract,
} from "./rows";

/** Ordinamento delle collezioni: `sort_order` è la volontà dell'owner, `id` rompe i pari. */
const BY_SORT_ORDER = [
  { column: "sort_order", ascending: true },
  { column: "id", ascending: true },
] as const;

/** La sitemap deve essere stabile fra due build a parità di dati. */
const BY_SLUG = [{ column: "slug", ascending: true }] as const;

/**
 * Sorgente audio della traccia `upload`: la route media, indirizzata con le due colonne
 * pubbliche che la riga già porta. `row.site_id` e non il parametro del metodo, perché il
 * tenant di una riga è un dato della riga — se i due divergessero, quello giusto è questo.
 */
function withAudioUrl(row: PublicTrackRow): PublicTrackRow {
  if (row.source !== "upload") return row;
  return { ...row, audio_url: mediaUrl("track", row.site_id, row.id) };
}

export function createPublicSiteReader(source: PublicRowSource): SiteReader {
  async function rowsOf(
    contract: { readonly relation: PublicRelation; readonly columns: readonly string[] },
    siteId: string,
  ): Promise<readonly unknown[]> {
    return source.fetchRows({
      relation: contract.relation,
      columns: contract.columns,
      filters: [{ column: "site_id", value: siteId }],
      order: BY_SORT_ORDER,
    });
  }

  return {
    async findPublishedSite(slug: string): Promise<PublicSiteRow | null> {
      // Il filtro `publication_status = 'published'` è dentro la vista: qui non si
      // ripete e soprattutto non si può disattivare da questo lato.
      const rows = await source.fetchRows({
        relation: publicSiteContract.relation,
        columns: publicSiteContract.columns,
        filters: [{ column: "slug", value: slug }],
        limit: 1,
      });
      const [row] = parseRows(publicSiteContract, rows);
      return row ?? null;
    },

    async listPublishedSites(): Promise<readonly PublishedSiteIndexRow[]> {
      const rows = await source.fetchRows({
        relation: publishedSiteIndexContract.relation,
        columns: publishedSiteIndexContract.columns,
        order: BY_SLUG,
      });
      return parseRows(publishedSiteIndexContract, rows);
    },

    async loadListen(siteId: string): Promise<ListenRecords> {
      const rows = parseRows(publicTrackContract, await rowsOf(publicTrackContract, siteId));
      return { tracks: rows.map(withAudioUrl) };
    },

    async loadFeed(siteId: string): Promise<FeedRecords> {
      const posts = parseRows(publicPostContract, await rowsOf(publicPostContract, siteId));
      return { posts, assets: [] };
    },

    async loadEpk(siteId: string): Promise<EpkRecords> {
      const [links, press, dates, metrics, contacts] = await Promise.all([
        rowsOf(publicLinkContract, siteId),
        rowsOf(publicPressContract, siteId),
        rowsOf(publicDateContract, siteId),
        rowsOf(publicMetricContract, siteId),
        rowsOf(publicContactContract, siteId),
      ]);

      return {
        links: parseRows(publicLinkContract, links),
        press: parseRows(publicPressContract, press),
        dates: parseRows(publicDateContract, dates),
        metrics: parseRows(publicMetricContract, metrics),
        // La vista filtra `consent_confirmed_at is not null`: qui non si può allentare.
        contacts: parseRows(publicContactContract, contacts),
        photoKit: [],
      };
    },

    async loadMerch(): Promise<MerchRecords> {
      return EMPTY_MERCH;
    },
  };
}
