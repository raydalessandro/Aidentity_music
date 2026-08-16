import type { ComponentType, ReactNode } from "react";

import type { ShellPalette } from "../site-shell/palettes";
import type { ShellConfig, ShellDestination } from "../site-shell/types";

/**
 * Vocabolario interno del renderer. Non è ancora parte di SiteConfig v1 e quindi non viene
 * persistito: il refactor prepara il confine senza cambiare il contratto di prodotto.
 */
export const SITE_TEMPLATE_IDS = ["baseline"] as const;
export type SiteTemplateId = (typeof SITE_TEMPLATE_IDS)[number];
export const DEFAULT_SITE_TEMPLATE_ID: SiteTemplateId = "baseline";

export type SiteTemplateSurfaceId = ShellConfig["surfaces"][number]["id"];

export type SiteTemplateHomeProps = {
  config: ShellConfig;
  palette: ShellPalette;
  previewId: string;
  /**
   * Passa attraverso il confine **invariata**, con la stessa forma e la stessa assenza di
   * default che ha in `SiteShell`.
   *
   * È la prop che questo refactor mette più a rischio: se il dispatch smettesse di
   * propagarla, ogni chiamante ricadrebbe nell'anteprima e il sito pubblicato tornerebbe ad
   * avere dock ad ancore, `PREVIEW · IT` in topbar e il player spento accanto a quello vero.
   * Il tipo non basta a impedirlo — una prop non propagata non è un errore di tipo — quindi
   * la propagazione è presidiata dai banchi di `app/[slug]/dock-routing.test.tsx`, che
   * rendono la HOME pubblicata **attraverso** questo confine e non più direttamente.
   */
  destination?: ShellDestination;
  heroSrc?: string | null;
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
  /**
   * Gli indirizzi arrivano già risolti dal read model: il template non sa costruirli e non
   * deve. È la stessa sorgente (`surfaceHref`) che alimenta il dock della HOME pubblicata,
   * e per questo qui **non** compare anche `ShellDestination`: due sorgenti di verità per lo
   * stesso indirizzo sono esattamente il difetto che la #26 ha chiuso.
   */
  navigation: readonly SiteTemplateNavItem[];
  /**
   * Senza default, come in `ShellTopbar`: il confine inoltra l'obbligo di dichiarare cosa si
   * sta rendendo invece di deciderlo al posto del chiamante. Un default qui — o un `true`
   * cablato nel template — significherebbe che il livello di presentazione sceglie una
   * parola che legge il visitatore di un sito vero.
   */
  published: boolean;
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
