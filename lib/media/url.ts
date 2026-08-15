// Costruttore dell'URL della route media. Modulo **senza alcun import**, di proposito.
//
// È l'unico pezzo di questo filone che `app/[slug]/**` può toccare, e quel perimetro non
// deve raggiungere il client Supabase in nessuna forma (presidio in
// `app/[slug]/composition.test.ts`). Un modulo con zero import non può portarcelo dentro
// nemmeno transitivamente, e `url.test.ts` fallisce se un import compare.
//
// La forma dell'URL è (kind, siteId, id): la coppia sito+riga è la stessa disciplina delle
// FK composite di §5 — «Le FK tra contenuti usano anche `site_id`». Il sito nell'URL non è
// decorazione: è il campo che rende verificabile l'isolamento fra tenant.

/** `/api/media/<kind>/<siteId>/<id>` — deve corrispondere alla cartella della route. */
export function mediaUrl(kind: "asset" | "track", siteId: string, id: string): string {
  return `/api/media/${kind}/${encodeURIComponent(siteId)}/${encodeURIComponent(id)}`;
}
