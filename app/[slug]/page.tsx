import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteTemplateHome } from "../../components/site-templates/SiteTemplate";
import { baseUrl } from "../../lib/base-url";
import { mediaUrl } from "../../lib/media/url";
import { ribbonVisuals } from "../../lib/site-visuals";
import { loadFeed, loadListen, loadSite } from "./composition";
import { buildListenView, publishedDestination } from "./read-model";
import { isAllowedEmbed } from "./embed";
import {
  UNAVAILABLE_METADATA,
  buildMusicGroupJsonLd,
  buildSurfaceMetadata,
  jsonLdScriptContent,
} from "./seo";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await loadSite(slug);
  if (resolution.status !== "ok") return UNAVAILABLE_METADATA;
  return buildSurfaceMetadata(resolution.site, "home", baseUrl());
}

export default async function HomeSurface({ params }: RouteParams) {
  const { slug } = await params;
  const resolution = await loadSite(slug);
  if (resolution.status !== "ok") notFound();

  const { site } = resolution;
  const [listenRecords, feed] = await Promise.all([loadListen(site.id), loadFeed(site.id)]);
  const listen = buildListenView(listenRecords.tracks, isAllowedEmbed);
  const jsonLd = buildMusicGroupJsonLd(site, baseUrl(), { tracks: listen.tracks });
  const visuals = ribbonVisuals(
    feed.assets,
    feed.posts,
    (asset) => asset.public_url,
    (asset) => asset.alt ?? `Visual di ${site.config.identity.name}`,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <SiteTemplateHome
        config={site.config}
        palette={site.palette}
        previewId={site.slug}
        heroSrc={site.heroAssetId === null ? null : mediaUrl("asset", site.id, site.heroAssetId)}
        visuals={visuals}
        destination={publishedDestination(site)}
      />
    </>
  );
}
