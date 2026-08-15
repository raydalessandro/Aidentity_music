import type { EpkContent } from "../../components/epk/types";
import type { SiteConfigDraft } from "../contract";
import type { WizardContact, WizardDate, WizardLink, WizardMetric, WizardPress } from "./types";

/**
 * Le preview C leggono le tabelle owner, non `public_contacts`. Filtriamo quindi
 * il consenso qui, al bordo, invece di dipendere dal fatto che EpkSurface lo
 * faccia internamente. Questo resta sicuro anche se il filone E sposta il filtro
 * definitivamente nella proiezione pubblica.
 */
export function epkContentForPreview(config: SiteConfigDraft, rows: {
  contacts: WizardContact[];
  links: WizardLink[];
  press: WizardPress[];
  dates: WizardDate[];
  metrics: WizardMetric[];
}): EpkContent {
  return {
    shortBio: config.identity.shortBio,
    longBio: config.identity.longBio,
    contacts: rows.contacts.filter((contact) => contact.consent_confirmed_at !== null),
    links: rows.links,
    press: rows.press,
    dates: rows.dates,
    metrics: rows.metrics,
  };
}
