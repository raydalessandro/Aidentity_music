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
// ── Ciò che questo adattatore NON restituisce, e perché non è una dimenticanza ─────────
//
// `PublicAssetRow` pretende `public_url` e `alt`. La proiezione `public_assets` espone
// `id`, `site_id`, `kind`, `sort_order` e nient'altro: `storage_path` è privato per §6 e
// `alt` non esiste nemmeno come colonna in `site_assets`. Un asset senza URL pubblico non
// è un'immagine renderizzabile, e inventare qui un percorso — `/api/media/<id>`, un URL
// firmato, un placeholder — significherebbe scrivere il contratto di una route che sta in
// un'altra PR e che potrebbe non chiamarsi così.
//
// Vale quindi la stessa regola già scritta per le tracce `upload` in `read-model.ts`
// (`upload-source-missing`): finché la sorgente pubblica non esiste, la collezione resta
// vuota. `FeedRecords.assets`, `EpkRecords.photoKit` e `MerchRecords.items` sono vuoti e
// **nessuna query parte** verso `public_assets`. I post invece sono contenuto testuale
// completo e vengono resi: FEED oggi mostra le didascalie, che è ciò che il renderer sa
// mostrare (`app/[slug]/feed/page.tsx`).

import {
  EMPTY_MERCH,
  type EpkRecords,
  type FeedRecords,
  type ListenRecords,
  type MerchRecords,
  type PublicSiteRow,
  type PublishedSiteIndexRow,
  type SiteReader,
} from "../../app/[slug]/site-reader";
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
      // `audio_url` resta assente: `public_tracks` non espone `storage_path` e non deve.
      // Il read model scarta l'upload con `upload-source-missing`, che è l'esito corretto.
      return { tracks: parseRows(publicTrackContract, await rowsOf(publicTrackContract, siteId)) };
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
