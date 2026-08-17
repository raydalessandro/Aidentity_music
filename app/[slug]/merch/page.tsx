import type { Metadata } from "next";

import { MerchDisclaimer, MerchGrid } from "../../../components/surfaces/content";
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
      <MerchDisclaimer />
      <MerchGrid
        items={records.items.map((item, index) => ({
          id: item.id,
          src: item.public_url,
          alt: item.alt ?? `Render merch ${index + 1}`,
        }))}
      />
    </SurfaceShell>
  );
}
