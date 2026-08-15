// Bordo di validazione (L0.7 §7): ciò che arriva da PostgREST non è fidato.
//
// Non è paranoia astratta. Fra il database e questo modulo ci sono una vista, una policy
// RLS, una grant di colonna e un serializzatore JSON: se una qualunque di queste derivasse
// — una colonna in più in una proiezione, un tipo cambiato, una `null` dove il tipo dice
// che non può esserci — il renderer riceverebbe una forma che il suo tipo dichiara
// impossibile e proseguirebbe come se nulla fosse. Qui la deriva si ferma e si nomina.
//
// Tre scelte, tutte deliberate:
//
// 1. **`z.guid()`, mai `z.uuid()`.** In Zod 4 `z.uuid()` pretende versione e variante
//    RFC 9562: `22222222-2222-2222-2222-222222222222` — l'identificativo del sito di
//    `supabase/seed.sql` — **non li rispetta e verrebbe rifiutato**. `gen_random_uuid()`
//    produce v4, ma le fixture no, e una fixture rifiutata dal bordo è un bordo rotto.
//    Misurato: `z.uuid()` sull'id del seed → `false`; `z.guid()` → `true`.
//
// 2. **Schemi `strict`.** Le colonne richieste sono esattamente quelle dello schema
//    (vedi `columnsOf`), quindi PostgREST non dovrebbe *mai* restituirne altre. Se lo fa,
//    la risposta non è quella che il contratto descrive e non entra nel dominio. È il
//    presidio che fa rumore se `public_contacts` iniziasse a portarsi dietro
//    `consent_confirmed_at` (L0.7 §6.3: il consenso è un filtro di riga, non un campo).
//
// 3. **Nessuna validazione parallela di `config`.** `config` è jsonb e la sua unica
//    autorità è `siteConfigSchema` in `lib/contract.ts`, invocata dal read model. Qui si
//    controlla soltanto che sia un oggetto JSON — cioè che sia *trasportabile*, non che
//    sia *pubblicabile*. Il giudizio sul contenuto resta uno solo.

import { z } from "zod";

import { SLUG_PATTERN } from "../../app/[slug]/slug";
import type { PublicRelation } from "./row-source";

/** Una riga non è ciò che il contratto dichiara: il chiamante non deve poterla ignorare. */
export class SiteReaderRowError extends Error {
  readonly relation: PublicRelation;
  readonly issues: readonly string[];

  constructor(relation: PublicRelation, issues: readonly string[]) {
    super(`Riga non valida da ${relation}: ${issues.join("; ")}`);
    this.name = "SiteReaderRowError";
    this.relation = relation;
    this.issues = issues;
  }
}

const guid = z.guid();
const nullableGuid = guid.nullable();
const sortOrder = z.int();
/** Il CHECK del database impone `btrim(x) <> ''`: un testo vuoto è una riga già rotta a monte. */
const filledText = z.string().trim().min(1);
/** `private.is_https_url` a monte; qui la stessa regola, espressa una volta sola. */
const httpsUrl = z.url().startsWith("https://");

/**
 * `config` come oggetto JSON e nulla più: la forma pubblicabile la decide
 * `siteConfigSchema` dal read model, e una seconda opinione qui sarebbe una copia
 * destinata a divergere.
 */
const jsonObject = z.record(z.string(), z.unknown());

/**
 * Schema e colonne nascono dalla stessa dichiarazione: la `select` chiede esattamente i
 * campi che lo schema accetta, quindi non possono divergere per distrazione.
 */
export type RelationContract<Shape extends z.ZodRawShape> = {
  readonly relation: PublicRelation;
  readonly columns: readonly string[];
  readonly schema: z.ZodObject<Shape>;
};

function contract<Shape extends z.ZodRawShape>(
  relation: PublicRelation,
  shape: Shape,
): RelationContract<Shape> {
  return { relation, columns: Object.keys(shape), schema: z.strictObject(shape) };
}

export const publicSiteContract = contract("public_sites", {
  id: guid,
  slug: z.string().regex(SLUG_PATTERN),
  config: jsonObject,
  hero_asset_id: nullableGuid,
});

/** La sitemap non ha bisogno dell'hero: chiedere meno colonne è la difesa più semplice. */
export const publishedSiteIndexContract = contract("public_sites", {
  id: guid,
  slug: z.string().regex(SLUG_PATTERN),
  config: jsonObject,
});

export const publicTrackContract = contract("public_tracks", {
  id: guid,
  site_id: guid,
  title: filledText,
  source: z.enum(["upload", "embed"]),
  // Il CHECK ammette solo valori positivi; `null` resta legittimo per gli embed.
  duration_seconds: z.int().positive().nullable(),
  embed_provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud"]).nullable(),
  // La coerenza fra `source`, `embed_provider` e `embed_url` la giudica `buildListenView`,
  // che sa anche scartare la traccia con una ragione. Qui si valida la forma, non la logica.
  embed_url: z.string().nullable(),
  sort_order: sortOrder,
});

export const publicPostContract = contract("public_posts", {
  id: guid,
  site_id: guid,
  kind: z.enum(["visual", "track"]),
  caption: z.string().nullable(),
  visual_asset_id: nullableGuid,
  cover_asset_id: nullableGuid,
  track_id: nullableGuid,
  sort_order: sortOrder,
});

export const publicLinkContract = contract("public_links", {
  id: guid,
  site_id: guid,
  provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud", "instagram", "tiktok"]),
  url: httpsUrl,
  sort_order: sortOrder,
});

export const publicPressContract = contract("public_press", {
  id: guid,
  site_id: guid,
  publication: filledText,
  quote: filledText,
  published_on: z.iso.date().nullable(),
  url: httpsUrl.nullable(),
  sort_order: sortOrder,
});

export const publicDateContract = contract("public_dates", {
  id: guid,
  site_id: guid,
  // `timestamptz` serializzato da PostgREST: sempre con offset esplicito.
  starts_at: z.iso.datetime({ offset: true }),
  city: filledText,
  venue: filledText,
  ticket_url: httpsUrl.nullable(),
  sort_order: sortOrder,
});

export const publicMetricContract = contract("public_metrics", {
  id: guid,
  site_id: guid,
  label: filledText,
  value: filledText,
  sort_order: sortOrder,
});

/**
 * Il bordo è qui più severo del CHECK del database, di proposito: l'indirizzo finisce in
 * un `mailto:` reso al pubblico, e un'email che non è un'email è un contatto inutilizzabile.
 * Lo schema `strict` è anche il presidio di §6.3: se un giorno la vista si portasse dietro
 * `consent_confirmed_at`, questa riga verrebbe rifiutata invece che resa.
 */
export const publicContactContract = contract("public_contacts", {
  id: guid,
  site_id: guid,
  role: z.enum(["booking", "management", "press"]),
  name: filledText,
  email: z.email(),
  sort_order: sortOrder,
});

function describe(issue: z.core.$ZodIssue, index: number): string {
  const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
  return `riga ${index}${path}: ${issue.message}`;
}

/**
 * Tutte le righe o nessuna. Scartare in silenzio la riga malata sembra gentile e non lo è:
 * una vetrina con un contatto in meno non ha modo di accorgersene, mentre `SiteReader` non
 * ha alcun canale per dichiarare uno scarto (a differenza di `ListenView.rejected`, che
 * quel canale ce l'ha). Meglio una superficie che fallisce a voce alta di una che mente
 * sottovoce.
 */
export function parseRows<Shape extends z.ZodRawShape>(
  { relation, schema }: RelationContract<Shape>,
  rows: readonly unknown[],
): readonly z.infer<z.ZodObject<Shape>>[] {
  const parsed: z.infer<z.ZodObject<Shape>>[] = [];
  const issues: string[] = [];

  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) parsed.push(result.data);
    else issues.push(...result.error.issues.map((issue) => describe(issue, index)));
  });

  if (issues.length > 0) throw new SiteReaderRowError(relation, issues);
  return parsed;
}
