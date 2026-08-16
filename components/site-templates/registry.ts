import { unicaTemplate } from "./unica";
import {
  DEFAULT_SITE_TEMPLATE_ID,
  type SiteTemplateDefinition,
  type SiteTemplateId,
} from "./types";

const SITE_TEMPLATES = {
  unica: unicaTemplate,
} satisfies Record<SiteTemplateId, SiteTemplateDefinition>;

export const siteTemplates: readonly SiteTemplateDefinition[] = Object.values(SITE_TEMPLATES);

export function getSiteTemplate(
  templateId: SiteTemplateId = DEFAULT_SITE_TEMPLATE_ID,
): SiteTemplateDefinition {
  return SITE_TEMPLATES[templateId];
}
