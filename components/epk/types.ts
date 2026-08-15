/**
 * Prop types dell'EPK.
 *
 * I nomi dei campi ricalcano **colonna per colonna** le tabelle di
 * `supabase/migrations/20260815140002_pr_0_database_contract.sql`, così il
 * filone D può passare le righe lette da Postgres senza scrivere adattatori.
 * Restano fuori i campi che non servono a rendere (`site_id`, `created_at`,
 * `updated_at`, `consent_confirmed_by`): un tipo che non li nomina è un tipo
 * che non li fa arrivare nel markup.
 *
 * Dove L0.7 §5 impone un insieme chiuso (provider dei link, ruoli contatto) il
 * tipo è quell'insieme chiuso, non `string`.
 */

/** `public.contact_role` — L0.7 §5. */
export const contactRoles = ["booking", "management", "press"] as const;
export type ContactRole = (typeof contactRoles)[number];

/** `public.link_provider` — L0.7 §5. Superset dei provider embed: include i social. */
export const linkProviders = [
  "spotify",
  "apple_music",
  "youtube",
  "soundcloud",
  "instagram",
  "tiktok",
] as const;
export type LinkProvider = (typeof linkProviders)[number];

/** Riga di `site_contacts`. `consent_confirmed_at` è l'unico lasciapassare per la pubblicazione. */
export type EpkContact = {
  id: string;
  role: ContactRole;
  name: string;
  email: string;
  /** ISO 8601 se il consenso è confermato, `null` altrimenti. Senza consenso il contatto non si rende. */
  consent_confirmed_at: string | null;
  sort_order: number;
};

/** Riga di `site_links`. */
export type EpkLink = {
  id: string;
  provider: LinkProvider;
  url: string;
  sort_order: number;
};

/** Riga di `site_press`: quote e testata obbligatorie, data e URL opzionali. */
export type EpkPressQuote = {
  id: string;
  publication: string;
  quote: string;
  /** `date` di Postgres, forma `YYYY-MM-DD`. */
  published_on: string | null;
  url: string | null;
  sort_order: number;
};

/** Riga di `site_dates`: data/ora con offset, città e venue obbligatorie. */
export type EpkLiveDate = {
  id: string;
  /** `timestamptz` serializzato: l'offset deve essere presente, è l'ora locale del locale. */
  starts_at: string;
  city: string;
  venue: string;
  ticket_url: string | null;
  sort_order: number;
};

/** Riga di `site_metrics`: solo etichetta e valore, entrambi inseriti a mano. */
export type EpkMetric = {
  id: string;
  label: string;
  value: string;
  sort_order: number;
};

/**
 * Tutto il contenuto EPK di un sito.
 * `shortBio` e `longBio` conservano i nomi che hanno in `site_config.config.identity`
 * (L0.7 §7), non quelli di una colonna: vengono da lì.
 */
export type EpkContent = {
  shortBio: string | null;
  longBio: string | null;
  contacts: readonly EpkContact[];
  links: readonly EpkLink[];
  press: readonly EpkPressQuote[];
  dates: readonly EpkLiveDate[];
  metrics: readonly EpkMetric[];
};
