import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteShell } from "../../components/site-shell/SiteShell";
import { baseUrl } from "../../lib/base-url";
import { loadListen, loadSite } from "./composition";
import { buildListenView } from "./read-model";
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
  // Slug riservato, slug malformato, sito non pubblicato o config non pubblicabile:
  // la risposta è sempre la stessa, e non racconta nulla di ciò che esiste nel database.
  if (resolution.status !== "ok") notFound();

  const { site } = resolution;
  const listen = buildListenView((await loadListen(site.id)).tracks, isAllowedEmbed);
  const jsonLd = buildMusicGroupJsonLd(site, baseUrl(), { tracks: listen.tracks });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <SiteShell config={site.config} palette={site.palette} previewId={site.slug} />
    </>
  );
}
