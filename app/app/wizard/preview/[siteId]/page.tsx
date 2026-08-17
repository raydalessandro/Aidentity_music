import { SiteTemplateHome } from "@/components/site-templates/SiteTemplate";
import { previewHrefs } from "@/lib/preview/navigation";
import { paletteForDraft } from "@/lib/wizard/palette";
import { ribbonVisuals } from "@/lib/site-visuals";

import { draftAssetSrc, draftBase, loadDraft } from "./draft";

export const dynamic = "force-dynamic";

/**
 * La HOME dell'anteprima, che è la HOME del sito.
 *
 * Fino a ieri questa pagina impilava sotto la HOME un inventario testuale della bozza e
 * l'EPK, e il dock puntava ad ancore: una pagina sola che scorreva, mentre il sito
 * pubblicato ha superfici separate. Ora la destinazione è `anteprima-navigabile`, quindi il
 * dock porta a `/app/wizard/preview/<id>/<superficie>` — pagine vere, come sul sito — e la
 * topbar continua a dire che è un'anteprima, perché lo è.
 */
export default async function OwnerPreviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const base = draftBase(siteId);
  const draft = await loadDraft(siteId, base);

  const visuals = ribbonVisuals(
    draft.assets,
    draft.posts,
    (asset) => draftAssetSrc(asset.id),
    (asset) => `Visual draft ${asset.id.slice(0, 8)}`,
  );

  return (
    <SiteTemplateHome
      config={draft.config}
      palette={paletteForDraft(draft.config)}
      previewId={`owner-${siteId}`}
      heroSrc={draft.heroAssetId === null ? null : draftAssetSrc(draft.heroAssetId)}
      visuals={visuals}
      destination={{ kind: "anteprima-navigabile", hrefs: previewHrefs(base) }}
    />
  );
}
