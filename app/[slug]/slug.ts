// Vocabolario dello slug: unica fonte lato applicazione.
// La fonte normativa resta il CHECK della colonna `slug` in
// supabase/migrations/20260815140002_pr_0_database_contract.sql (L0.7 §5).
// `slug.parity.test.ts` fallisce se questa costante e il CHECK divergono:
// due copie che possono divergere in silenzio non sono ammesse.

/** Lista v1 esatta degli slug riservati (L0.7 §5), in ordine alfabetico come nel CHECK. */
export const RESERVED_SLUGS = [
  "_next",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "epk",
  "login",
  "one-sheet",
  "preview",
] as const;

export type ReservedSlug = (typeof RESERVED_SLUGS)[number];

/** Stessa forma del CHECK: minuscolo, gruppi alfanumerici separati da un solo trattino. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const reserved: ReadonlySet<string> = new Set(RESERVED_SLUGS);

export function isReservedSlug(value: string): boolean {
  return reserved.has(value);
}

export type SlugVerdict =
  | { readonly kind: "valid"; readonly slug: string }
  | { readonly kind: "malformed"; readonly slug: string }
  | { readonly kind: "reserved"; readonly slug: string };

/**
 * Un solo punto decide se uno slug può arrivare al database.
 * Uno slug riservato o malformato non deve nemmeno produrre una query.
 *
 * La lista riservata è controllata per prima: `_next` è insieme riservato e fuori forma
 * (l'underscore non passa la regex), e la ragione più specifica è quella che vale.
 * L'esito pubblico è identico nei due casi, cambia solo la diagnosi.
 */
export function classifySlug(value: string): SlugVerdict {
  if (isReservedSlug(value)) return { kind: "reserved", slug: value };
  if (!SLUG_PATTERN.test(value)) return { kind: "malformed", slug: value };
  return { kind: "valid", slug: value };
}
