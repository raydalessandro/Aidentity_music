import type { Metadata } from "next";

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
      {records.posts.length > 0 ? (
        <div className="feed-grid" aria-label="Feed visuale">
          {records.posts.map((post, index) => {
            const assetId = post.kind === "visual" ? post.visual_asset_id : post.cover_asset_id;
            const asset = assetId ? assets.get(assetId) : undefined;
            if (asset) {
              return (
                <article className="feed-card" key={post.id} data-post={post.kind}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- route media revocabile. */}
                  <img src={asset.public_url} alt={asset.alt ?? post.caption ?? `Visual ${index + 1}`} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </article>
              );
            }
            return (
              <article className="feed-card feed-type" key={post.id} data-post={post.kind}>
                <small>{String(index + 1).padStart(2, "0")} / TRACK</small>
                <strong>{post.caption ?? "TRACCIA"}</strong>
              </article>
            );
          })}
        </div>
      ) : null}
    </SurfaceShell>
  );
}
