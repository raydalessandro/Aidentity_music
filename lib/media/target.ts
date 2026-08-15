// Bordo di validazione della richiesta. Ciò che arriva dall'URL non è fidato.

import { z } from "zod";

import { MEDIA_KINDS, type MediaKind } from "./media";

/**
 * `z.guid()` e mai `z.uuid()`.
 *
 * In Zod 4 `z.uuid()` pretende versione e variante RFC 9562. Gli identificativi del seed
 * (`22222222-2222-2222-2222-222222222222`, `33333333-…`) non li rispettano: con `z.uuid()`
 * la fixture del repo verrebbe rifiutata dal bordo e ogni test positivo sarebbe scritto
 * contro identificativi che il prodotto non ha. Misurato in `target.test.ts`.
 */
const guid = z.guid();

const targetSchema = z.object({
  kind: z.enum(MEDIA_KINDS as [MediaKind, ...MediaKind[]]),
  siteId: guid,
  id: guid,
});

export type MediaTarget = z.infer<typeof targetSchema>;

export type MediaTargetResult =
  | { readonly ok: true; readonly target: MediaTarget }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * I segmenti dinamici arrivano come `Record<string, string | string[]>`: un catch-all o un
 * segmento ripetuto produce un array, che qui non è accettabile e non va appiattito.
 */
export function parseMediaTarget(raw: unknown): MediaTargetResult {
  const parsed = targetSchema.safeParse(raw);
  if (parsed.success) return { ok: true, target: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    ),
  };
}
