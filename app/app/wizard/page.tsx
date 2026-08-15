import { redirect } from "next/navigation";

import { siteConfigDraftSchema } from "@/lib/contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WizardInitialData } from "@/lib/wizard/types";

import WizardClient from "./WizardClient";
import styles from "./wizard.module.css";

export const dynamic = "force-dynamic";

export default async function WizardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fapp%2Fwizard");

  const { data: sites } = await supabase
    .from("sites")
    .select("id,slug,publication_status")
    .order("created_at", { ascending: true })
    .limit(1);
  const site = sites?.[0] ?? null;

  let initial: WizardInitialData = {
    site,
    config: null,
    heroAssetId: null,
    assets: [], tracks: [], posts: [], links: [], press: [], dates: [], metrics: [], contacts: [], previewLinks: [],
  };

  if (site) {
    const [configResult, assets, tracks, posts, links, press, dates, metrics, contacts, previewLinks] = await Promise.all([
      supabase.from("site_config").select("config,hero_asset_id").eq("site_id", site.id).maybeSingle(),
      supabase.from("site_assets").select("id,kind,mime_type,byte_size,sort_order").eq("site_id", site.id).is("purged_at", null).order("sort_order"),
      supabase.from("site_tracks").select("id,title,source,duration_seconds,embed_provider,embed_url,sort_order").eq("site_id", site.id).is("purged_at", null).order("sort_order"),
      supabase.from("site_posts").select("id,kind,visual_asset_id,track_id,cover_asset_id,caption,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_links").select("id,provider,url,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_press").select("id,publication,quote,published_on,url,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_dates").select("id,starts_at,city,venue,ticket_url,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_metrics").select("id,label,value,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_contacts").select("id,role,name,email,consent_confirmed_at,sort_order").eq("site_id", site.id).order("sort_order"),
      supabase.from("site_preview_links").select("id,expires_at,revoked_at").eq("site_id", site.id).order("created_at", { ascending: false }),
    ]);

    const config = siteConfigDraftSchema.safeParse(configResult.data?.config);
    initial = {
      site,
      config: config.success ? config.data : null,
      heroAssetId: configResult.data?.hero_asset_id ?? null,
      assets: assets.data ?? [], tracks: tracks.data ?? [], posts: posts.data ?? [], links: links.data ?? [], press: press.data ?? [],
      dates: dates.data ?? [], metrics: metrics.data ?? [], contacts: contacts.data ?? [], previewLinks: previewLinks.data ?? [],
    };
  }

  return <main className={styles.page}><div className={styles.shell}><WizardClient initial={initial} userId={user.id} /></div></main>;
}
