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
 *
 * ── I contatti hanno due tipi, e la differenza è il consenso ──────────────────
 *
 * Per i contatti «la colonna» non è una sola cosa. `site_contacts` ha
 * `consent_confirmed_at`; la proiezione pubblica `public_contacts` **non ce l'ha
 * e non può averla**, perché L0.7 §6.3 tiene il consenso fuori dalle proiezioni
 * e lì è un filtro di riga. Un unico tipo per entrambe le forme costringe o a
 * inventare il campo dove non c'è, o a rinunciare al filtro dove c'è.
 *
 * Quindi le forme sono due, e il confine è controllato dal compilatore:
 * `EpkContactRecord` è la riga di tabella, `EpkContact` è la riga di render, e
 * l'unico ponte fra le due è `publishableContacts` (si veda `select.ts`).
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

/**
 * Contatto **in forma di render**: ciò che `EpkContacts` accetta e che può finire nel markup.
 *
 * Sono esattamente le colonne di `public_contacts`, quindi il filone D le passa così come
 * arrivano da `loadEpk`, senza adattatori. Non ha `consent_confirmed_at` perché a questo
 * punto la domanda sul consenso ha già ricevuto risposta: una riga che è qui è pubblicabile.
 *
 * `consent_confirmed_at?: never` non è una decorazione ed è il cuore del presidio. Rende
 * `EpkContactRecord` **non assegnabile** a `EpkContact`: una riga di tabella non può entrare
 * in un componente di render nemmeno per distrazione, e il compilatore lo dice prima che il
 * codice esista. Serve per domani più che per oggi — il wizard del filone C leggerà i contatti
 * dell'owner **dalle tabelle**, dove il campo esiste e può essere nullo; senza questa riga,
 * rendere quelle righe con `EpkContacts` mostrerebbe come pubblicato un contatto che non lo è,
 * e nulla lo segnalerebbe. La sonda `contact-boundary.probe.ts` misura entrambe le direzioni.
 */
export type EpkContact = {
  id: string;
  role: ContactRole;
  name: string;
  email: string;
  sort_order: number;
  /** Presidio di tipo, non un dato: una riga che porta il consenso non è una riga di render. */
  consent_confirmed_at?: never;
};

/**
 * Contatto **in forma di riga di tabella**: `site_contacts` letta dall'owner (filone C).
 *
 * `consent_confirmed_at` è ISO 8601 se il consenso è confermato, `null` altrimenti, ed è
 * l'unico lasciapassare per la pubblicazione. Non si rende direttamente: passa da
 * `publishableContacts`, che è anche il solo punto in cui il campo viene letto.
 */
export type EpkContactRecord = Omit<EpkContact, "consent_confirmed_at"> & {
  consent_confirmed_at: string | null;
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
  /** Righe di tabella: `EpkSurface` le fa passare da `publishableContacts` prima di renderle. */
  contacts: readonly EpkContactRecord[];
  links: readonly EpkLink[];
  press: readonly EpkPressQuote[];
  dates: readonly EpkLiveDate[];
  metrics: readonly EpkMetric[];
};
