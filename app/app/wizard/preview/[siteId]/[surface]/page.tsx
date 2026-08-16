import { notFound } from "next/navigation";

import { buildListenView } from "@/app/[slug]/read-model";
import { isAllowedEmbed } from "@/app/[slug]/embed";
import { TrackCatalogue } from "@/app/[slug]/surface-content";
import { EpkSurface } from "@/components/epk/EpkSurface";
import { SiteTemplateSurface } from "@/components/site-templates/SiteTemplate";
import { FeedGrid, MerchDisclaimer, MerchGrid } from "@/components/surfaces/content";
import type { EmbedProvider, PublicTrackRow } from "@/app/[slug]/site-reader";
import {
  isPreviewSurface,
  isSurfaceEnabled,
  previewLabel,
  previewNavigation,
} from "@/lib/preview/navigation";
import { paletteForDraft } from "@/lib/wizard/palette";
import { epkContentForPreview } from "@/lib/wizard/preview-content";

import { draftAssetSrc, draftBase, draftTrackSrc, loadDraft, type DraftRecords } from "../draft";

export const dynamic = "force-dynamic";

/** Le tracce della bozza nella forma che il read model pubblico già sa giudicare. */
function draftTrackRows(draft: DraftRecords): readonly PublicTrackRow[] {
  return draft.tracks.map((track) => ({
    id: track.id,
    site_id: draft.siteId,
    title: track.title,
    source: track.source === "upload" ? "upload" : "embed",
    duration_seconds: track.duration_seconds,
    embed_provider: (track.embed_provider ?? null) as EmbedProvider | null,
    embed_url: track.embed_url,
    sort_order: track.sort_order,
    // L'upload passa dalla route owner autenticata: è la stessa disciplina della hero.
    audio_url: track.source === "upload" ? draftTrackSrc(track.id) : null,
  }));
}

export default async function OwnerPreviewSurface({
  params,
}: {
  params: Promise<{ siteId: string; surface: string }>;
}) {
  const { siteId, surface } = await params;
  if (!isPreviewSurface(surface)) notFound();

  const base = draftBase(siteId);
  const draft = await loadDraft(siteId, `${base}/${surface}`);

  // Una superficie spenta non è raggiungibile, non soltanto nascosta dal dock: è la stessa
  // regola del sito pubblicato, e l'anteprima deve dire la verità anche su questo.
  if (!isSurfaceEnabled(draft.config, surface)) notFound();

  const assets = new Map(draft.assets.map((asset) => [asset.id, asset]));

  return (
    <SiteTemplateSurface
      config={draft.config}
      palette={paletteForDraft(draft.config)}
      surface={surface}
      label={previewLabel(draft.config, surface)}
      navigation={previewNavigation(draft.config, base)}
      heroSrc={draft.heroAssetId === null ? null : draftAssetSrc(draft.heroAssetId)}
      published={false}
    >
      {surface === "listen" && (
        <TrackCatalogue view={buildListenView(draftTrackRows(draft), isAllowedEmbed)} />
      )}

      {surface === "feed" && (
        <FeedGrid
          entries={draft.posts.map((post, index) => {
            const assetId = post.kind === "visual" ? post.visual_asset_id : post.cover_asset_id;
            const asset = assetId ? assets.get(assetId) : undefined;
            return {
              id: post.id,
              kind: post.kind === "visual" ? "visual" : "track",
              src: asset ? draftAssetSrc(asset.id) : null,
              alt: post.caption ?? `Visual ${index + 1}`,
              caption: post.caption,
            };
          })}
        />
      )}

      {surface === "merch" && (
        <>
          <MerchDisclaimer />
          <MerchGrid
            items={draft.assets
              .filter((asset) => asset.kind === "merch")
              .map((asset, index) => ({
                id: asset.id,
                src: draftAssetSrc(asset.id),
                alt: `Render merch ${index + 1}`,
              }))}
          />
        </>
      )}

      {surface === "epk" && (
        <EpkSurface
          content={epkContentForPreview(draft.config, {
            contacts: [...draft.contacts],
            links: [...draft.links],
            press: [...draft.press],
            dates: [...draft.dates],
            metrics: [...draft.metrics],
          })}
          id={`epk-owner-${siteId}`}
          label="EPK anteprima"
        />
      )}
    </SiteTemplateSurface>
  );
}
