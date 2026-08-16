import { redirect } from "next/navigation";

import { siteConfigDraftSchema, siteConfigSchema } from "@/lib/contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WizardInitialData } from "@/lib/wizard/types";

import PublishPanel from "./PublishPanel";
import WizardClient from "./WizardClient";
import styles from "./wizard.module.css";

export const dynamic = "force-dynamic";

type SubscriptionSummary = {
  plan_code: string;
  billing_interval: string;
  billing_status: string;
};

export default async function WizardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fapp%2Fwizard");

  const query = await searchParams;
  const checkoutRaw = query.checkout;
  const checkoutOutcome = checkoutRaw === "ok" || checkoutRaw === "annullato" ? checkoutRaw : null;

  const { data: sites } = await supabase
    .from("sites")
    .select("id,slug,publication_status")
    .order("created_at", { ascending: true })
    .limit(1);
  const site = sites?.[0] ?? null;

  let subscription: SubscriptionSummary | null = null;
  let initial: WizardInitialData = {
    site,
    config: null,
    heroAssetId: null,
    assets: [], tracks: [], posts: [], links: [], press: [], dates: [], metrics: [], contacts: [], previewLinks: [],
  };

  if (site) {
    const [configResult, assets, tracks, posts, links, press, dates, metrics, contacts, previewLinks, subscriptionResult] = await Promise.all([
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
      supabase.from("site_subscriptions").select("plan_code,billing_interval,billing_status").eq("site_id", site.id).maybeSingle(),
    ]);

    const config = siteConfigDraftSchema.safeParse(configResult.data?.config);
    initial = {
      site,
      config: config.success ? config.data : null,
      heroAssetId: configResult.data?.hero_asset_id ?? null,
      assets: assets.data ?? [], tracks: tracks.data ?? [], posts: posts.data ?? [], links: links.data ?? [], press: press.data ?? [],
      dates: dates.data ?? [], metrics: metrics.data ?? [], contacts: contacts.data ?? [], previewLinks: previewLinks.data ?? [],
    };
    subscription = (subscriptionResult.data as SubscriptionSummary | null) ?? null;
  }

  const readyForCheckout = initial.config !== null
    && siteConfigSchema.safeParse(initial.config).success
    && initial.heroAssetId !== null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.controlIntro} data-control-intro>
          <div>
            <p className={styles.eyebrow}>AIDENTITY / CONTROL ROOM</p>
            <p className={styles.controlCopy}>Il motore salva in continuo. Tu lavora sul risultato.</p>
          </div>
          <div className={styles.controlLegend}>
            <span><i data-tone="acid" /> DRAFT</span>
            <span><i /> PREVIEW</span>
            <span><i /> EPK</span>
            <span><i /> PUBBLICAZIONE</span>
          </div>
        </div>

        <WizardClient initial={initial} userId={user.id} />

        {site && (
          <PublishPanel
            siteId={site.id}
            slug={site.slug}
            publicationStatus={site.publication_status}
            billingStatus={subscription?.billing_status ?? null}
            currentPlan={subscription?.plan_code ?? null}
            currentInterval={subscription?.billing_interval ?? null}
            readyForCheckout={readyForCheckout}
            checkoutOutcome={checkoutOutcome}
          />
        )}
      </div>
    </main>
  );
}
