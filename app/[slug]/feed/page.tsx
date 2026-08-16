import type { Metadata } from "next";

import { FeedGrid } from "../../../components/surfaces/content";
import { loadFeed } from "../composition";
import { SurfaceShell } from "../surface-content";
import { requireSurface, surfaceMetadata } from "../surface-route";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return surfaceMetadata(slug, "feed");
}

export default async function FeedSurface({ params }: RouteParams) {
  const { slug } = await params;
  const site = await requireSurface(slug, "feed");
  const records = await loadFeed(site.id);
  const assets = new Map(records.assets.map((asset) => [asset.id, asset]));

  return (
    <SurfaceShell site={site} surface="feed">
      <FeedGrid
        entries={records.posts.map((post, index) => {
          const assetId = post.kind === "visual" ? post.visual_asset_id : post.cover_asset_id;
          const asset = assetId ? assets.get(assetId) : undefined;
          return {
            id: post.id,
            kind: post.kind === "visual" ? "visual" : "track",
            src: asset?.public_url ?? null,
            alt: asset?.alt ?? post.caption ?? `Visual ${index + 1}`,
            caption: post.caption,
          };
        })}
      />
    </SurfaceShell>
  );
}
