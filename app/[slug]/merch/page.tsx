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
        <div className="merch-grid" aria-label="Render merch">
          {records.items.map((item, index) => (
            <article className="merch-card" key={item.id}>
              <div className="merch-shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- route media revocabile. */}
                <img src={item.public_url} alt={item.alt ?? `Render merch ${index + 1}`} />
                <span className="merch-badge">RENDER</span>
              </div>
              <p>Studio visuale {String(index + 1).padStart(2, "0")}</p>
            </article>
          ))}
        </div>
      ) : null}
    </SurfaceShell>
  );
}
