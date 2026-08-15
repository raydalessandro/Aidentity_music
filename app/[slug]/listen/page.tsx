import type { Metadata } from "next";

import { loadListen } from "../composition";
import { isAllowedEmbed } from "../embed";
import { buildListenView } from "../read-model";
import { SurfaceShell, TrackCatalogue } from "../surface-content";
import { requireSurface, surfaceMetadata } from "../surface-route";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return surfaceMetadata(slug, "listen");
}

export default async function ListenSurface({ params }: RouteParams) {
  const { slug } = await params;
  const site = await requireSurface(slug, "listen");
  const view = buildListenView((await loadListen(site.id)).tracks, isAllowedEmbed);

  return (
    <SurfaceShell site={site} surface="listen">
      <TrackCatalogue view={view} />
    </SurfaceShell>
  );
}
