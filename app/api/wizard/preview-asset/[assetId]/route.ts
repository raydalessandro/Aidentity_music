import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { MEDIA_BUCKET, isServableMimeType } from "@/lib/media/media";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assetIdSchema = z.guid();

/**
 * Media privato del builder.
 *
 * La route pubblica /api/media continua a richiedere `published`: non viene
 * indebolita per far funzionare un'anteprima. Qui prima leggiamo la riga con il
 * client della sessione, quindi con RLS: un id di un altro tenant è invisibile.
 * Solo dopo quel confine usiamo service_role per firmare il bucket privato.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<NextResponse> {
  const { assetId } = await params;
  if (!assetIdSchema.safeParse(assetId).success) {
    return NextResponse.json({ error: "asset non trovato" }, { status: 404 });
  }

  const scoped = await createSupabaseServerClient();
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });
  }

  const { data: asset, error: readError } = await scoped
    .from("site_assets")
    .select("storage_path,mime_type,purged_at")
    .eq("id", assetId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "anteprima non disponibile" }, { status: 500 });
  }
  if (
    !asset
    || asset.purged_at !== null
    || !isServableMimeType("asset", asset.mime_type)
  ) {
    return NextResponse.json({ error: "asset non trovato" }, { status: 404 });
  }

  const privileged = createSupabaseServiceRoleClient();
  const { data: signed, error: signError } = await privileged.storage
    .from(MEDIA_BUCKET.asset)
    .createSignedUrl(asset.storage_path, 60);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "anteprima non disponibile" }, { status: 502 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
