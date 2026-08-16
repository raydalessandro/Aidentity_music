import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EpkSurface } from "@/components/epk/EpkSurface";
import { SiteTemplateHome } from "@/components/site-templates/SiteTemplate";
import { siteConfigDraftSchema } from "@/lib/contract";
import { DraftContentPreview } from "@/lib/wizard/DraftContentPreview";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { paletteForDraft, paletteStyleForDraft } from "@/lib/wizard/palette";
import { epkContentForPreview } from "@/lib/wizard/preview-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TokenPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 20 || token.length > 100) notFound();

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = createSupabaseServiceRoleClient();
  const { data: link } = await supabase
    .from("site_preview_links")
    .select("site_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  // Server Component asincrono: `react-hooks/purity` vieta il non determinismo
  // nel render di un componente client, ma qui non c'e' nessun render client.
  // Un controllo di scadenza deve leggere l'ora corrente, e prenderla da
  // altrove significherebbe fidarsi di un valore arrivato dal chiamante.
  // eslint-disable-next-line react-hooks/purity
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) notFound();

  const siteId = link.site_id;
  const [configResult, contacts, links, press, dates, metrics, assets, tracks, posts] = await Promise.all([
    supabase.from("site_config").select("config").eq("site_id", siteId).maybeSingle(),
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

  return (
    <main style={paletteStyleForDraft(parsed.data)}>
      <p style={{ padding: "12px 16px", margin: 0, fontFamily: "monospace" }}>PREVIEW TEMPORANEA · non indicizzata</p>
      <SiteTemplateHome config={parsed.data} palette={paletteForDraft(parsed.data)} previewId={`token-${siteId}`} />
      <DraftContentPreview
        config={parsed.data}
        previewId={`token-${siteId}`}
        assets={assets.data ?? []}
        tracks={tracks.data ?? []}
        posts={posts.data ?? []}
      />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 120px" }}>
        <EpkSurface content={epk} id={`epk-token-${siteId}`} label="EPK preview temporanea" />
      </div>
    </main>
  );
}
