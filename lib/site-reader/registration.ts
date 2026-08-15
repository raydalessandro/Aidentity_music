// L'UNICO chiamante di `configureSiteReader` in tutto il prodotto.
//
// `app/[slug]/composition.ts` dichiara la porta e tiene il riferimento; qui si decide, una
// volta sola e fuori da `app/[slug]/**`, quale implementazione ci finisce dentro.
// `site-reader.registration.test.ts` fallisce se compare un secondo chiamante: un bordo di
// composizione che si moltiplica smette di essere un bordo.
//
// ── Perché la registrazione può fallire, e perché fallire in silenzio è la scelta giusta ─
//
// `npm run check` esegue `next build`, e la CI **non ha segreti**: nessun
// `NEXT_PUBLIC_SUPABASE_URL`, nessuna chiave `anon`. La sitemap ha `revalidate = 3600`,
// quindi viene prerenderizzata durante il build e chiama `listPublishedSites()`. Se
// l'adattatore venisse registrato comunque, quel prerender proverebbe a leggere il database
// e il build fallirebbe per assenza di configurazione — cioè per un motivo che non riguarda
// il codice in revisione.
//
// Quindi il client viene richiesto **subito**, una volta: se l'ambiente non c'è, l'esito è
// `registered: false` con una ragione dichiarata, resta attivo `unconfiguredSiteReader` e il
// comportamento è esattamente quello di oggi (nessun sito risolve). Se l'ambiente c'è ma è
// sbagliato, l'errore emerge all'avvio del processo e non alla prima visita.

import { configureSiteReader } from "../../app/[slug]/composition";
import { createPostgrestRowSource, type PostgrestClientLike } from "./postgrest-row-source";
import { createPublicSiteReader } from "./public-site-reader";

export type SiteReaderRegistration =
  | { readonly registered: true }
  | {
      readonly registered: false;
      readonly reason: "public-reader-client-unavailable";
      readonly detail: string;
    };

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerSiteReader(
  createClient: () => PostgrestClientLike,
): SiteReaderRegistration {
  let client: PostgrestClientLike;
  try {
    client = createClient();
  } catch (error) {
    return {
      registered: false,
      reason: "public-reader-client-unavailable",
      detail: detailOf(error),
    };
  }

  configureSiteReader(createPublicSiteReader(createPostgrestRowSource(() => client)));
  return { registered: true };
}
