// Route media: l'unico modo in cui un file dello Storage raggiunge un visitatore.
//
// ── Perché sta qui, e non altrove ────────────────────────────────────────────────────────
//
// Sotto `app/api/**` perché è una route server con `service_role`, e `app/[slug]/**` non
// può importare il client Supabase in nessuna forma (presidio in
// `app/[slug]/composition.test.ts`, che non va allentato). Il renderer chiama questa route
// **per URL**, con `mediaUrl()` di `lib/media/url.ts` — un modulo senza alcun import.
//
// La forma `/api/media/<kind>/<siteId>/<id>` porta il sito nell'URL di proposito. Non è
// ridondanza: è la stessa disciplina delle FK composite di §5 («Le FK tra contenuti usano
// anche `site_id`»). Con il solo identificativo di riga l'isolamento fra tenant non sarebbe
// nemmeno esprimibile, e quindi non sarebbe verificabile; con la coppia, chiedere l'asset di
// un tenant sotto il sito di un altro è una richiesta che si può formulare e che deve
// fallire — `lib/media/handle.test.ts` la formula e verifica che fallisca.
//
// ── Cosa NON fa questo file ──────────────────────────────────────────────────────────────
//
// Nessun giudizio. Non conosce `published`, non conosce `purged_at`, non conosce
// `storage_path`. Legge i segmenti, costruisce le dipendenze privilegiate, delega a
// `handleMediaRequest` e converte il risultato. `lib/media/route-shell.test.ts` fallisce se
// una decisione ricompare qui: una regola di sicurezza duplicata in un guscio non
// testabile è una regola che prima o poi divergerà.

import { NextResponse } from "next/server";

import { handleMediaRequest } from "@/lib/media/handle";
import type { MediaDeps, MediaLogger } from "@/lib/media/ports";
import {
  bridgeSupabaseMediaClient,
  bridgeSupabaseStorage,
  createFetchMediaObjectFetcher,
  createSupabaseMediaSigner,
  createSupabaseMediaSource,
} from "@/lib/media/supabase-media";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le dipendenze si costruiscono qui dentro e non al caricamento del modulo: `deps` viene
 * invocata da `handleMediaRequest` **dopo** la validazione, quindi un URL malformato non
 * fa nemmeno leggere `SUPABASE_SERVICE_ROLE_KEY` dall'ambiente.
 */
function deps(): MediaDeps {
  const client = createSupabaseServiceRoleClient();
  return {
    source: createSupabaseMediaSource(() => bridgeSupabaseMediaClient(client)),
    signer: createSupabaseMediaSigner(() => bridgeSupabaseStorage(client)),
    fetcher: createFetchMediaObjectFetcher((url) => fetch(url)),
  };
}

/** Diagnostica senza segreti: `stage`, `kind`, identificativo. Mai il path, mai la chiave. */
const log: MediaLogger = (event) => {
  console.warn("[media] richiesta non completata", event);
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; siteId: string; id: string }> },
): Promise<NextResponse | Response> {
  const result = await handleMediaRequest(await params, deps, log);

  if (result.kind === "json") {
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }

  // `Response` e non `NextResponse.json`: il corpo sono byte, non JSON.
  return new Response(new Uint8Array(result.bytes), {
    status: result.status,
    headers: result.headers,
  });
}
