export type OneSheetDensity = "low" | "medium" | "high";

export type OneSheetIdentity = {
  readonly name: string;
  readonly handle: string;
  readonly claim: string;
  readonly shortBio: string;
  readonly longBio: string;
  readonly location: string;
};

export type OneSheetPalette = {
  readonly ink: string;
  readonly panel: string;
  readonly paper: string;
  readonly muted: string;
  readonly dim: string;
  readonly line: string;
  readonly acid: string;
  readonly acidInk: string;
};

type TenantRow = { readonly id: string; readonly site_id: string; readonly sort_order: number };

export type OneSheetContact = TenantRow & {
  readonly role: "booking" | "management" | "press";
  readonly name: string;
  readonly email: string;
  readonly consent_confirmed_at?: never;
  readonly consent_confirmed_by?: never;
};

export type OneSheetLink = TenantRow & {
  readonly provider: string;
  readonly url: string;
};

export type OneSheetPress = TenantRow & {
  readonly publication: string;
  readonly quote: string;
  readonly published_on: string | null;
  readonly url: string | null;
};

export type OneSheetDate = TenantRow & {
  readonly starts_at: string;
  readonly city: string;
  readonly venue: string;
  readonly ticket_url: string | null;
};

export type OneSheetMetric = TenantRow & {
  readonly label: string;
  readonly value: string;
};

export type OneSheetPhoto = TenantRow & {
  readonly kind: string;
  readonly alt: string | null;
  readonly src: string;
};

export type OneSheetInput = {
  readonly siteId: string;
  readonly slug: string;
  readonly identity: OneSheetIdentity;
  readonly palette: OneSheetPalette;
  readonly contacts: readonly OneSheetContact[];
  readonly links: readonly OneSheetLink[];
  readonly press: readonly OneSheetPress[];
  readonly dates: readonly OneSheetDate[];
  readonly metrics: readonly OneSheetMetric[];
  readonly photoKit: readonly OneSheetPhoto[];
};

export type PreparedOneSheet = Omit<OneSheetInput, "contacts" | "links" | "press" | "dates" | "metrics" | "photoKit"> & {
  readonly density: OneSheetDensity;
  readonly contacts: readonly OneSheetContact[];
  readonly links: readonly OneSheetLink[];
  readonly press: readonly OneSheetPress[];
  readonly dates: readonly OneSheetDate[];
  readonly metrics: readonly OneSheetMetric[];
  readonly photoKit: readonly OneSheetPhoto[];
};

const LIMITS: Readonly<Record<OneSheetDensity, Readonly<Record<"contacts" | "links" | "press" | "dates" | "metrics" | "photoKit", number>>>> = {
  low: { contacts: 2, links: 3, press: 1, dates: 2, metrics: 3, photoKit: 2 },
  medium: { contacts: 3, links: 4, press: 2, dates: 4, metrics: 4, photoKit: 3 },
  high: { contacts: 3, links: 5, press: 3, dates: 5, metrics: 5, photoKit: 4 },
};

function ownTenant<T extends TenantRow>(rows: readonly T[], siteId: string): T[] {
  return rows.filter((row) => row.site_id === siteId).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * `public_contacts` non espone il consenso. Se quel campo ricompare a runtime, la riga non
 * proviene più dal bordo pubblico contrattuale: falliamo chiuso e non pubblichiamo l'email.
 */
function publicContactShape(contact: OneSheetContact): boolean {
  return !("consent_confirmed_at" in contact) && !("consent_confirmed_by" in contact);
}

export function materialScore(input: OneSheetInput): number {
  const photos = Math.min(input.photoKit.length, 4) * 2;
  const editorial = Math.min(input.press.length, 3) * 2;
  const utility =
    Math.min(input.contacts.length, 3) +
    Math.min(input.links.length, 5) +
    Math.min(input.dates.length, 5) +
    Math.min(input.metrics.length, 5);
  return photos + editorial + utility;
}

export function chooseDensity(input: OneSheetInput): OneSheetDensity {
  const score = materialScore(input);
  if (score <= 7) return "low";
  if (score <= 17) return "medium";
  return "high";
}

export function prepareOneSheet(input: OneSheetInput): PreparedOneSheet {
  const ownContacts = ownTenant(input.contacts, input.siteId).filter(publicContactShape);
  const ownLinks = ownTenant(input.links, input.siteId);
  const ownPress = ownTenant(input.press, input.siteId);
  const ownDates = ownTenant(input.dates, input.siteId);
  const ownMetrics = ownTenant(input.metrics, input.siteId);
  const ownPhotos = ownTenant(input.photoKit, input.siteId).filter((photo) => photo.kind === "photo_hi");

  const density = chooseDensity({
    ...input,
    contacts: ownContacts,
    links: ownLinks,
    press: ownPress,
    dates: ownDates,
    metrics: ownMetrics,
    photoKit: ownPhotos,
  });
  const limits = LIMITS[density];

  return {
    ...input,
    density,
    contacts: ownContacts.slice(0, limits.contacts),
    links: ownLinks.slice(0, limits.links),
    press: ownPress.slice(0, limits.press),
    dates: ownDates.slice(0, limits.dates),
    metrics: ownMetrics.slice(0, limits.metrics),
    photoKit: ownPhotos.slice(0, limits.photoKit),
  };
}
