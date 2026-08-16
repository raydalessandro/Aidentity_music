import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteTemplateHome } from "../../components/site-templates/SiteTemplate";
import { baseUrl } from "../../lib/base-url";
import { mediaUrl } from "../../lib/media/url";
import { loadListen, loadSite } from "./composition";
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
      {/*
        HOME senza visual principale era il buco visibile: `hero_asset_id` esiste in
        `public_sites` (§7: FK composita fuori dal JSON), ma nessuna sorgente pubblica sapeva
        trasformarlo in un'immagine. Qui la pagina scrive soltanto un URL — `lib/media/url.ts`
        non ha import, quindi il presidio di `composition.test.ts` resta intatto: questa
        cartella non raggiunge il client Supabase. Il controllo su `published`, sulla purga e
        sul tenant lo fa la route quando il browser chiede l'immagine.
      */}
      <SiteTemplateHome
        config={site.config}
        palette={site.palette}
        previewId={site.slug}
        heroSrc={site.heroAssetId === null ? null : mediaUrl("asset", site.id, site.heroAssetId)}
        destination={publishedDestination(site)}
      />
    </>
  );
}
