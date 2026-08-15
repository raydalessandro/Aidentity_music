/**
 * Superficie pubblica del filone E.
 *
 * Il filone D importa da qui: componenti e tipi, niente query e niente accesso
 * al database. I dati arrivano già tipizzati dall'esterno.
 */

export { EpkSurface, type EpkSurfaceProps } from "./EpkSurface";
export { EpkBio, type EpkBioProps } from "./EpkBio";
export { EpkContacts, type EpkContactsProps } from "./EpkContacts";
export { EpkLinks, type EpkLinksProps } from "./EpkLinks";
export { EpkLiveDates, type EpkLiveDatesProps } from "./EpkLiveDates";
export { EpkMetrics, type EpkMetricsProps } from "./EpkMetrics";
export { EpkPress, type EpkPressProps } from "./EpkPress";

export {
  contactRoles,
  linkProviders,
  type ContactRole,
  type EpkContact,
  type EpkContent,
  type EpkLink,
  type EpkLiveDate,
  type EpkMetric,
  type EpkPressQuote,
  type LinkProvider,
} from "./types";

export {
  publishableContacts,
  publishableLinks,
  publishableMetrics,
  publishablePress,
  splitLiveDates,
  type ResolvedLiveDate,
  type SplitLiveDates,
} from "./select";
