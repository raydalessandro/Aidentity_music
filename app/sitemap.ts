import type { MetadataRoute } from "next";

import { baseUrl } from "../lib/base-url";
import { loadPublishedSites } from "./[slug]/composition";
import { buildSitemapEntries } from "./[slug]/seo";

/**
 * Un sito pubblicato dopo il deploy deve poter entrare nella sitemap senza un nuovo deploy:
 * l'elenco è rigenerato periodicamente, non congelato alla build.
 */
export const revalidate = 3600;

/**
 * L'accesso ai dati passa dal bordo di composizione, mai da un client diretto.
 * La costruzione delle voci è una funzione pura, testata in `app/[slug]/seo.test.ts`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sites = await loadPublishedSites();
  return buildSitemapEntries(sites, baseUrl());
}
