import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { MEDIA_BUCKET, isServableMimeType } from "@/lib/media/media";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trackIdSchema = z.guid();

/**
 * Audio privato del builder — gemello di `preview-asset`, e deliberatamente gemello.
 *
 * Senza questa route l'anteprima dell'owner poteva mostrare le tracce **caricate** solo
 * come righe di un elenco: il read model scarta un upload senza sorgente
 * (`upload-source-missing`) invece di rendere un player muto, quindi sparivano proprio le
 * tracce che l'artista ha appena caricato. Il difetto si vedeva così: «le tracce si vedono
 * ma non c'è il player».
 *
 * L'ordine è quello che conta e non cambia rispetto al gemello: prima la sessione, poi la
 * lettura **sotto RLS** (una traccia di un altro tenant è invisibile), e solo dopo quel
 * confine `service_role` firma il bucket privato. La route pubblica `/api/media` continua a
 * richiedere `published`: non viene indebolita per far funzionare un'anteprima.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> },
): Promise<NextResponse> {
  const { trackId } = await params;
  if (!trackIdSchema.safeParse(trackId).success) {
    return NextResponse.json({ error: "traccia non trovata" }, { status: 404 });
  }

  const scoped = await createSupabaseServerClient();
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });
  }

  const { data: track, error: readError } = await scoped
    .from("site_tracks")
    .select("storage_path,mime_type,purged_at,source")
    .eq("id", trackId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "anteprima non disponibile" }, { status: 500 });
  }
  // Una traccia `embed` non ha byte da servire: il suo indirizzo è l'URL del provider, che
  // passa dalla allow-list e non da qui. Chiederla a questa route è una richiesta senza
  // senso, e riceve la stessa risposta di una che non esiste.
  if (
    !track
    || track.source !== "upload"
    || track.storage_path === null
    || track.purged_at !== null
    || !isServableMimeType("track", track.mime_type)
  ) {
    return NextResponse.json({ error: "traccia non trovata" }, { status: 404 });
  }

  const privileged = createSupabaseServiceRoleClient();
  const { data: signed, error: signError } = await privileged.storage
    .from(MEDIA_BUCKET.track)
    .createSignedUrl(track.storage_path, 60);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "anteprima non disponibile" }, { status: 502 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
