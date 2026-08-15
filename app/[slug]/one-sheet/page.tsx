import { notFound } from "next/navigation";

import { OneSheet, type OneSheetInput } from "../../../components/one-sheet";
import { mediaUrl } from "../../../lib/media/url";
import { loadEpk, loadSite } from "../composition";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };


export default async function OneSheetPage({ params }: RouteParams) {
  const { slug } = await params;
  const resolution = await loadSite(slug);
  if (resolution.status !== "ok") notFound();

  const site = resolution.site;
  const records = await loadEpk(site.id);
  const input: OneSheetInput = {
    siteId: site.id,
    slug: site.slug,
    identity: site.config.identity,
    palette: site.palette,
    contacts: records.contacts,
    links: records.links,
    press: records.press,
    dates: records.dates,
    metrics: records.metrics,
    photoKit: records.photoKit.map((photo) => ({
      ...photo,
      src: mediaUrl("asset", site.id, photo.id),
    })),
  };

  return <OneSheet input={input} />;
}
