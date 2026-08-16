import { notFound, redirect } from "next/navigation";

import { EpkSurface } from "@/components/epk/EpkSurface";
import { SiteTemplateHome } from "@/components/site-templates/SiteTemplate";
import { siteConfigDraftSchema } from "@/lib/contract";
import { DraftContentPreview } from "@/lib/wizard/DraftContentPreview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { paletteForDraft } from "@/lib/wizard/palette";
import { epkContentForPreview } from "@/lib/wizard/preview-content";

export const dynamic = "force-dynamic";

export default async function OwnerPreviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/wizard/preview/${siteId}`)}`);

  const { data: site } = await supabase.from("sites").select("id").eq("id", siteId).maybeSingle();
  if (!site) notFound();

  const [configResult, contacts, links, press, dates, metrics, assets, tracks, posts] = await Promise.all([
    supabase.from("site_config").select("config,hero_asset_id").eq("site_id", siteId).maybeSingle(),
    supabase.from("site_contacts").select("id,role,name,email,consent_confirmed_at,sort_order").eq("site_id", siteId).order("sort_order"),
    supabase.from("site_links").select("id,provider,url,sort_order").eq("site_id", siteId).order("sort_order"),
    supabase.from("site_press").select("id,publication,quote,published_on,url,sort_order").eq("site_id", siteId).order("sort_order"),
    supabase.from("site_dates").select("id,starts_at,city,venue,ticket_url,sort_order").eq("site_id", siteId).order("sort_order"),
    supabase.from("site_metrics").select("id,label,value,sort_order").eq("site_id", siteId).order("sort_order"),
    supabase.from("site_assets").select("id,kind,mime_type,byte_size,sort_order").eq("site_id", siteId).is("purged_at", null).order("sort_order"),
    supabase.from("site_tracks").select("id,title,source,duration_seconds,embed_provider,embed_url,sort_order").eq("site_id", siteId).is("purged_at", null).order("sort_order"),
    supabase.from("site_posts").select("id,kind,visual_asset_id,track_id,cover_asset_id,caption,sort_order").eq("site_id", siteId).order("sort_order"),
  ]);
  const parsed = siteConfigDraftSchema.safeParse(configResult.data?.config);
  if (!parsed.success) notFound();
  const epk = epkContentForPreview(parsed.data, {
    contacts: contacts.data ?? [], links: links.data ?? [], press: press.data ?? [], dates: dates.data ?? [], metrics: metrics.data ?? [],
  });

  const previewId = `owner-${siteId}`;
  const heroSrc = configResult.data?.hero_asset_id
    ? `/api/wizard/preview-asset/${configResult.data.hero_asset_id}`
    : null;
  const captionByAsset = new Map(
    (posts.data ?? [])
      .filter((post) => post.kind === "visual" && post.visual_asset_id)
      .map((post) => [post.visual_asset_id!, post.caption] as const),
  );
  const visuals = (assets.data ?? [])
    .filter((asset) => asset.kind === "visual")
    .slice(0, 5)
    .map((asset) => ({
      id: asset.id,
      src: `/api/wizard/preview-asset/${asset.id}`,
      alt: `Visual draft ${asset.id.slice(0, 8)}`,
      caption: captionByAsset.get(asset.id) ?? "VISUAL",
    }));

  return (
    <SiteTemplateHome
      config={parsed.data}
      palette={paletteForDraft(parsed.data)}
      previewId={previewId}
      heroSrc={heroSrc}
      visuals={visuals}
    >
      <DraftContentPreview
        config={parsed.data}
        previewId={previewId}
        assets={assets.data ?? []}
        tracks={tracks.data ?? []}
        posts={posts.data ?? []}
      />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 120px" }}>
        <EpkSurface content={epk} id={`epk-${previewId}`} label="EPK preview owner" />
      </div>
    </SiteTemplateHome>
  );
}
