// Guardia comune alle superfici spegnibili.
// Un'unica risposta per quattro cause diverse: slug riservato o malformato, sito non
// pubblicato, config non pubblicabile, superficie spenta. Il pubblico non deve poter
// distinguere "non esiste" da "esiste ma è in bozza".

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { baseUrl } from "../../lib/base-url";
import { loadSite } from "./composition";
import { isSurfaceReachable, type SiteView, type SurfaceId } from "./read-model";
import { UNAVAILABLE_METADATA, buildSurfaceMetadata } from "./seo";

export async function requireSurface(slug: string, surface: SurfaceId): Promise<SiteView> {
  const resolution = await loadSite(slug);
  if (resolution.status !== "ok") notFound();
  if (!isSurfaceReachable(resolution.site.config, surface)) notFound();
  return resolution.site;
}

export async function surfaceMetadata(slug: string, surface: SurfaceId): Promise<Metadata> {
  const resolution = await loadSite(slug);
  if (resolution.status !== "ok") return UNAVAILABLE_METADATA;
  if (!isSurfaceReachable(resolution.site.config, surface)) return UNAVAILABLE_METADATA;
  return buildSurfaceMetadata(resolution.site, surface, baseUrl());
}
