import {
  type EpkRecords,
  type FeedRecords,
  type ListenRecords,
  type MerchRecords,
  type PublicAssetRow,
  type PublicSiteRow,
  type PublicTrackRow,
  type PublishedSiteIndexRow,
  type SiteReader,
} from "../../app/[slug]/site-reader";
import { mediaUrl } from "../media/url";
import type { PublicRelation, PublicRowSource } from "./row-source";
import {
  parseRows,
  publicAssetContract,
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

const BY_SORT_ORDER = [
  { column: "sort_order", ascending: true },
  { column: "id", ascending: true },
] as const;
const BY_SLUG = [{ column: "slug", ascending: true }] as const;

function withAudioUrl(row: PublicTrackRow): PublicTrackRow {
  if (row.source !== "upload") return row;
  return { ...row, audio_url: mediaUrl("track", row.site_id, row.id) };
}

function withAssetUrl(
  row: Pick<PublicAssetRow, "id" | "site_id" | "kind" | "sort_order">,
): PublicAssetRow {
  return {
    ...row,
    public_url: mediaUrl("asset", row.site_id, row.id),
    // v1 non persiste ancora un alt testuale sugli asset. Il renderer produce un fallback
    // contestuale; non inventiamo descrizioni dentro il database.
    alt: null,
  };
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

  async function assetsOf(siteId: string): Promise<readonly PublicAssetRow[]> {
    const rows = parseRows(publicAssetContract, await rowsOf(publicAssetContract, siteId));
    return rows.map(withAssetUrl);
  }

  return {
    async findPublishedSite(slug: string): Promise<PublicSiteRow | null> {
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
      const [postRows, assets] = await Promise.all([
        rowsOf(publicPostContract, siteId),
        assetsOf(siteId),
      ]);
      const posts = parseRows(publicPostContract, postRows);
      const used = new Set<string>();
      for (const post of posts) {
        if (post.visual_asset_id) used.add(post.visual_asset_id);
        if (post.cover_asset_id) used.add(post.cover_asset_id);
      }
      return { posts, assets: assets.filter((asset) => used.has(asset.id)) };
    },

    async loadEpk(siteId: string): Promise<EpkRecords> {
      const [links, press, dates, metrics, contacts, assets] = await Promise.all([
        rowsOf(publicLinkContract, siteId),
        rowsOf(publicPressContract, siteId),
        rowsOf(publicDateContract, siteId),
        rowsOf(publicMetricContract, siteId),
        rowsOf(publicContactContract, siteId),
        assetsOf(siteId),
      ]);

      return {
        links: parseRows(publicLinkContract, links),
        press: parseRows(publicPressContract, press),
        dates: parseRows(publicDateContract, dates),
        metrics: parseRows(publicMetricContract, metrics),
        contacts: parseRows(publicContactContract, contacts),
        photoKit: assets.filter((asset) => asset.kind === "photo_hi"),
      };
    },

    async loadMerch(siteId: string): Promise<MerchRecords> {
      const assets = await assetsOf(siteId);
      return { items: assets.filter((asset) => asset.kind === "merch") };
    },
  };
}
