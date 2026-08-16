import type { ComponentType, ReactNode } from "react";

import type { ShellPalette } from "../site-shell/palettes";
import type { ShellConfig, ShellDestination } from "../site-shell/types";

/**
 * Vocabolario interno del renderer. Non è ancora parte di SiteConfig v1 e quindi non viene
 * persistito: i template restano un confine visuale finché non esiste una vera scelta utente.
 * `unica` è il primo template reale; i successivi dovranno consumare questa stessa forma.
 */
export const SITE_TEMPLATE_IDS = ["unica"] as const;
export type SiteTemplateId = (typeof SITE_TEMPLATE_IDS)[number];
export const DEFAULT_SITE_TEMPLATE_ID: SiteTemplateId = "unica";

export type SiteTemplateSurfaceId = ShellConfig["surfaces"][number]["id"];

/**
 * Visual già risolto dal chiamante. Non aggiunge dati persistiti al template: è solo la
 * proiezione render-ready degli asset che Aidentity possiede già.
 */
export type SiteTemplateVisual = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
};

export type SiteTemplateHomeProps = {
  config: ShellConfig;
  palette: ShellPalette;
  previewId: string;
  /**
   * Passa attraverso il confine invariata. Pubblicato significa href reali; assente significa
   * anteprima a schermo unico. Il template può cambiare stile, non questa semantica.
   */
  destination?: ShellDestination;
  heroSrc?: string | null;
  /** Visual derivati dagli asset esistenti, usati dalla ribbon stile NVLL CLICK. */
  visuals?: readonly SiteTemplateVisual[];
  /** Contiene il chrome nel box quando il template vive in showroom/builder. */
  embedded?: boolean;
  /** False nel live builder: il template rende, ma non finge navigazione fra superfici. */
  interactive?: boolean;
  /** Contenuto draft appendibile nella preview owner, dentro lo stesso template. */
  children?: ReactNode;
};

export type SiteTemplateNavItem = {
  id: SiteTemplateSurfaceId;
  enabled: boolean;
  label: string;
  href: string;
};

export type SiteTemplateSurfaceProps = {
  config: ShellConfig;
  palette: ShellPalette;
  surface: SiteTemplateSurfaceId;
  label: string;
  navigation: readonly SiteTemplateNavItem[];
  /** Il chiamante decide se è pubblico: il template decide soltanto come mostrarlo. */
  published: boolean;
  /** Hero già mediato dalla route media, utile alle superfici visuali. */
  heroSrc?: string | null;
  children: ReactNode;
};

export type SiteTemplateDefinition = {
  id: SiteTemplateId;
  label: string;
  Home: ComponentType<SiteTemplateHomeProps>;
  Surface: ComponentType<SiteTemplateSurfaceProps>;
};

export type SiteTemplateSelection = {
  templateId?: SiteTemplateId;
};
