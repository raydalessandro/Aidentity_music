import { notFound, redirect } from "next/navigation";

import { siteConfigDraftSchema, type SiteConfigDraft } from "@/lib/contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  WizardAsset,
  WizardContact,
  WizardDate,
  WizardLink,
  WizardMetric,
  WizardPost,
  WizardPress,
  WizardTrack,
} from "@/lib/wizard/types";

/**
 * La bozza letta una volta sola, per la HOME e per ogni superficie dell'anteprima.
 *
 * Tutte le letture passano dal client della **sessione**, quindi sotto RLS: la bozza di un
 * altro tenant non è raggiungibile nemmeno indovinando l'identificativo. È lo stesso
 * confine della route `preview-asset`, e non va allargato per comodità di impaginazione.
 */
export type DraftRecords = {
  readonly siteId: string;
  readonly config: SiteConfigDraft;
  readonly heroAssetId: string | null;
  readonly assets: readonly WizardAsset[];
  readonly tracks: readonly WizardTrack[];
  readonly posts: readonly WizardPost[];
  readonly contacts: readonly WizardContact[];
  readonly links: readonly WizardLink[];
  readonly press: readonly WizardPress[];
  readonly dates: readonly WizardDate[];
  readonly metrics: readonly WizardMetric[];
};

export async function loadDraft(siteId: string, path: string): Promise<DraftRecords> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

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

  return {
    siteId,
    config: parsed.data,
    heroAssetId: configResult.data?.hero_asset_id ?? null,
    assets: assets.data ?? [],
    tracks: tracks.data ?? [],
    posts: posts.data ?? [],
    contacts: contacts.data ?? [],
    links: links.data ?? [],
    press: press.data ?? [],
    dates: dates.data ?? [],
    metrics: metrics.data ?? [],
  };
}

/** La radice dell'anteprima owner. La HOME è questa: una superficie, non un cappello. */
export function draftBase(siteId: string): string {
  return `/app/wizard/preview/${siteId}`;
}

/** I media della bozza passano dalle route owner autenticate, mai dallo Storage diretto. */
export function draftAssetSrc(assetId: string): string {
  return `/api/wizard/preview-asset/${assetId}`;
}

export function draftTrackSrc(trackId: string): string {
  return `/api/wizard/preview-track/${trackId}`;
}
