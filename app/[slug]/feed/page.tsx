// FEED — superficie spegnibile. Senza una proiezione pubblica di `site_posts` (stop b)
// la lista resta vuota: la struttura della route esiste, il contenuto no.

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

  return (
    <SurfaceShell site={site} surface="feed">
      {records.posts.length > 0 ? (
        <ul className="feed-list">
          {records.posts.map((post) => (
            <li key={post.id} data-post={post.kind}>
              {post.caption}
            </li>
          ))}
        </ul>
      ) : null}
    </SurfaceShell>
  );
}
