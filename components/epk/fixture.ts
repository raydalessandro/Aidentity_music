/**
 * Banco di prova dell'EPK.
 *
 * Metà delle righe **deve essere rifiutata**. Una fixture di soli casi validi
 * non dimostra nulla: dimostra solo che il codice sa copiare l'input in output.
 *
 * `mustNotAppear` elenca le stringhe esatte che non devono comparire nel markup
 * reso. Ogni voce ha una motivazione contrattuale, così un test negativo può
 * dichiarare l'esito atteso invece di limitarsi a “non contiene nulla”.
 *
 * Non è esportata da `index.ts`: è materiale di prova, non prodotto.
 */

import type {
  EpkContactRecord,
  EpkContent,
  EpkLink,
  EpkLiveDate,
  EpkMetric,
  EpkPressQuote,
} from "./types";

/**
 * Riga che i tipi vieterebbero ma che la rete può consegnare comunque: i dati
 * arrivano come JSON da Postgres, e TypeScript non è un confine di runtime.
 * Il cast serve a simulare dati ostili, non ad aggirare un vincolo.
 */
function hostile<T>(row: Record<string, unknown>): T {
  return row as T;
}

/** Riferimento temporale fisso: le date di prova sono relative a questo istante. */
export const fixtureNow = new Date("2026-08-15T12:00:00Z");

/** Righe di tabella (`site_contacts`), non righe di render: portano il campo del consenso. */
export const fixtureContacts: readonly EpkContactRecord[] = [
  {
    id: "contact-booking",
    role: "booking",
    name: "Giulia Ferri",
    email: "booking@nvllclick.example",
    consent_confirmed_at: "2026-07-01T09:00:00+02:00",
    sort_order: 0,
  },
  {
    id: "contact-press",
    role: "press",
    name: "Marta Sesti",
    email: "stampa@nvllclick.example",
    consent_confirmed_at: "2026-07-02T09:00:00+02:00",
    sort_order: 1,
  },
  // RIFIUTATO: nessun consenso confermato (L0.7 §2, §5).
  {
    id: "contact-senza-consenso",
    role: "management",
    name: "Luca Ferrante",
    email: "nonconsentito@nvllclick.example",
    consent_confirmed_at: null,
    sort_order: 2,
  },
  // RIFIUTATO: consenso presente ma email malformata (stessa forma del CHECK in `site_contacts`).
  {
    id: "contact-email-rotta",
    role: "booking",
    name: "Email Rotta",
    email: "email-senza-chiocciola",
    consent_confirmed_at: "2026-07-03T09:00:00+02:00",
    sort_order: 3,
  },
  // RIFIUTATO: consenso presente ma nome vuoto.
  {
    id: "contact-senza-nome",
    role: "press",
    name: "   ",
    email: "senzanome@nvllclick.example",
    consent_confirmed_at: "2026-07-04T09:00:00+02:00",
    sort_order: 4,
  },
];

export const fixtureLinks: readonly EpkLink[] = [
  { id: "link-spotify", provider: "spotify", url: "https://open.spotify.com/artist/nvllclick", sort_order: 0 },
  { id: "link-tiktok", provider: "tiktok", url: "https://www.tiktok.com/@nvllclick", sort_order: 1 },
  // RIFIUTATO: provider fuori dall'insieme chiuso di L0.7 §5.
  hostile<EpkLink>({
    id: "link-provider-fuori-set",
    provider: "bandcamp",
    url: "https://nvllclick.bandcamp.example/album",
    sort_order: 2,
  }),
  // RIFIUTATO: URL non https.
  {
    id: "link-non-https",
    provider: "youtube",
    url: "http://www.youtube.com/@nvllclick",
    sort_order: 3,
  },
  // RIFIUTATO: schema pericoloso travestito da URL.
  hostile<EpkLink>({
    id: "link-javascript",
    provider: "instagram",
    url: "javascript:alert('epk')",
    sort_order: 4,
  }),
];

export const fixturePress: readonly EpkPressQuote[] = [
  {
    id: "press-rumore",
    publication: "Rumore",
    quote: "Un disco che non chiede il permesso.",
    published_on: "2026-03-14",
    url: "https://rumore.example/nvll-click",
    sort_order: 0,
  },
  // ACCETTATO a metà: la quote resta, il link no (URL non https).
  {
    id: "press-link-insicuro",
    publication: "Blow Up",
    quote: "Tre accordi e una minaccia.",
    published_on: null,
    url: "http://blowup.example/nvll-click",
    sort_order: 1,
  },
  // RIFIUTATO: quote vuota (L0.7 §5 la richiede).
  {
    id: "press-senza-quote",
    publication: "Testata Senza Quote",
    quote: "   ",
    published_on: "2026-01-01",
    sort_order: 2,
    url: null,
  },
];

export const fixtureDates: readonly EpkLiveDate[] = [
  {
    id: "date-futura-vicina",
    starts_at: "2026-09-12T21:30:00+02:00",
    city: "Milano",
    venue: "Circolo Magnolia",
    ticket_url: "https://biglietti.example/magnolia",
    sort_order: 0,
  },
  {
    id: "date-futura-lontana",
    starts_at: "2026-11-04T22:00:00+01:00",
    city: "Bologna",
    venue: "Locomotiv",
    ticket_url: null,
    sort_order: 1,
  },
  {
    id: "date-passata-recente",
    starts_at: "2026-06-20T21:00:00+02:00",
    city: "Roma",
    venue: "Monk",
    ticket_url: null,
    sort_order: 2,
  },
  {
    id: "date-passata-vecchia",
    starts_at: "2025-10-03T21:00:00+02:00",
    city: "Torino",
    venue: "sPAZIO211",
    ticket_url: null,
    sort_order: 3,
  },
  // RIFIUTATA: `timestamptz` senza offset, l'istante sarebbe ambiguo.
  {
    id: "date-senza-offset",
    starts_at: "2026-12-31T23:00:00",
    city: "Napoli",
    venue: "Duel Beat",
    ticket_url: null,
    sort_order: 4,
  },
  // RIFIUTATA: venue vuota (L0.7 §5 la richiede).
  {
    id: "date-senza-venue",
    starts_at: "2026-10-01T21:00:00+02:00",
    city: "Firenze",
    venue: "  ",
    ticket_url: null,
    sort_order: 5,
  },
];

export const fixtureMetrics: readonly EpkMetric[] = [
  { id: "metric-ascolti", label: "Ascolti mensili", value: "184.000", sort_order: 0 },
  { id: "metric-date", label: "Date nel 2026", value: "31", sort_order: 1 },
  // RIFIUTATA: etichetta vuota.
  { id: "metric-senza-etichetta", label: "   ", value: "999999", sort_order: 2 },
  // RIFIUTATA: valore vuoto.
  { id: "metric-senza-valore", label: "Etichetta orfana", value: "", sort_order: 3 },
];

export const fixtureContent: EpkContent = {
  shortBio: "NVLL CLICK è il progetto elettronico di Vera Sanna.",
  longBio: "NVLL CLICK nasce a Milano nel 2023.\nDue EP, una manciata di remix e un rifiuto ostinato del ritornello facile.",
  contacts: fixtureContacts,
  links: fixtureLinks,
  press: fixturePress,
  dates: fixtureDates,
  metrics: fixtureMetrics,
};

/** Contenuto interamente vuoto: serve a provare che non nasce nessun segnaposto. */
export const emptyContent: EpkContent = {
  shortBio: null,
  longBio: "   ",
  contacts: [],
  links: [],
  press: [],
  dates: [],
  metrics: [],
};

/**
 * Stringhe che il markup **non** deve contenere, con il motivo.
 * Ogni voce è l'esito atteso di un caso rifiutato dalla fixture.
 */
export const mustNotAppear: readonly { value: string; because: string }[] = [
  {
    value: "nonconsentito@nvllclick.example",
    because: "contatto senza consent_confirmed_at: L0.7 §2 e §5 vietano la pubblicazione",
  },
  { value: "Luca Ferrante", because: "nome del contatto senza consenso" },
  { value: "email-senza-chiocciola", because: "email malformata anche con consenso confermato" },
  { value: "senzanome@nvllclick.example", because: "contatto con nome vuoto" },
  { value: "bandcamp", because: "provider fuori dall'insieme chiuso di L0.7 §5" },
  { value: "http://www.youtube.com/@nvllclick", because: "URL del link non https" },
  { value: "javascript:alert", because: "schema pericoloso in un URL di link" },
  { value: "http://blowup.example/nvll-click", because: "URL della quote stampa non https" },
  { value: "Testata Senza Quote", because: "quote stampa vuota" },
  { value: "Duel Beat", because: "data live senza offset: istante ambiguo" },
  { value: "Firenze", because: "data live senza venue" },
  { value: "999999", because: "metrica con etichetta vuota" },
  { value: "Etichetta orfana", because: "metrica con valore vuoto" },
];
