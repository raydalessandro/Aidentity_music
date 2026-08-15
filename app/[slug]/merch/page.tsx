// MERCH — superficie spegnibile. Render dichiarati come tali, senza acquisto (L0.7 §2).
// Senza una proiezione pubblica di `site_assets` (stop b) la griglia resta vuota.

import type { Metadata } from "next";

import { loadMerch } from "../composition";
import { SurfaceShell } from "../surface-content";
import { requireSurface, surfaceMetadata } from "../surface-route";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return surfaceMetadata(slug, "merch");
}

export default async function MerchSurface({ params }: RouteParams) {
  const { slug } = await params;
  const site = await requireSurface(slug, "merch");
  const records = await loadMerch(site.id);

  return (
    <SurfaceShell site={site} surface="merch">
      <p>I capi mostrati sono render. Non sono in vendita da questa pagina.</p>
      {records.items.length > 0 ? (
        <ul className="merch-grid">
          {records.items.map((item) => (
            <li key={item.id}>{item.alt}</li>
          ))}
        </ul>
      ) : null}
    </SurfaceShell>
  );
}
