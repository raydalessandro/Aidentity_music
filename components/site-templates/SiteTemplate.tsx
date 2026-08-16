import { getSiteTemplate } from "./registry";
import {
  DEFAULT_SITE_TEMPLATE_ID,
  type SiteTemplateHomeProps,
  type SiteTemplateSelection,
  type SiteTemplateSurfaceProps,
} from "./types";

/**
 * Unico punto di dispatch verso un template. Lo spread è deliberato: tutto ciò che arriva
 * qui deve arrivare al template **senza** che questo livello scelga cosa lasciar passare.
 * Un elenco esplicito di prop sarebbe il modo naturale di perdere `destination`.
 */
export function SiteTemplateHome({
  templateId = DEFAULT_SITE_TEMPLATE_ID,
  ...props
}: SiteTemplateHomeProps & SiteTemplateSelection) {
  const Home = getSiteTemplate(templateId).Home;
  return <Home {...props} />;
}

export function SiteTemplateSurface({
  templateId = DEFAULT_SITE_TEMPLATE_ID,
  ...props
}: SiteTemplateSurfaceProps & SiteTemplateSelection) {
  const Surface = getSiteTemplate(templateId).Surface;
  return <Surface {...props} />;
}

export {
  DEFAULT_SITE_TEMPLATE_ID,
  SITE_TEMPLATE_IDS,
  type SiteTemplateId,
} from "./types";
