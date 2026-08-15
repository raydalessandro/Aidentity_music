import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { trackSchema } from "@/lib/contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  completeTrackUpload,
  releaseUpload,
  reserveTrackUpload,
} from "@/lib/wizard/upload-server";
import {
  TRACK_BUCKET,
  TRACK_MAX_BYTES,
  isTrackMimeAllowed,
} from "@/lib/wizard/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadCommon = {
  siteId: z.guid(),
  title: z.string().trim().min(1),
  byteSize: z.number().int().positive().max(TRACK_MAX_BYTES),
  mimeType: z.string().trim().min(1),
};
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("embed"),
    siteId: z.guid(),
    title: z.string().trim().min(1),
    provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud"]),
    url: z.string().url().startsWith("https://"),
  }),
  z.object({ action: z.literal("reserve"), ...uploadCommon }),
  z.object({ action: z.literal("finalize"), reservationId: z.guid(), ...uploadCommon }),
  z.object({ action: z.literal("release"), siteId: z.guid(), reservationId: z.guid() }),
]);

function operationFailure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "";
  if (message === "reserve:23514") return NextResponse.json({ error: "quota del piano superata" }, { status: 409 });
  if (message.endsWith(":42501")) return NextResponse.json({ error: "sito non trovato" }, { status: 404 });
  if (message === "stored-object-mismatch") return NextResponse.json({ error: "file trasferito non coerente" }, { status: 409 });
  return NextResponse.json({ error: "operazione traccia non completata" }, { status: 500 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const scoped = await createSupabaseServerClient();
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });

  try {
    if (parsed.data.action === "release") {
      await releaseUpload({
        siteId: parsed.data.siteId,
        userId: user.id,
        reservationId: parsed.data.reservationId,
        bucket: TRACK_BUCKET,
      });
      return new NextResponse(null, { status: 204 });
    }

    if (parsed.data.action === "embed") {
      // Il client scoped è il controllo owner. La scrittura resta backend-only.
      const { data: site, error: siteError } = await scoped
        .from("sites")
        .select("id")
        .eq("id", parsed.data.siteId)
        .maybeSingle();
      if (siteError) return NextResponse.json({ error: "sito non leggibile" }, { status: 500 });
      if (!site) return NextResponse.json({ error: "sito non trovato" }, { status: 404 });

      const track = trackSchema.safeParse({
        source: "embed",
        title: parsed.data.title,
        provider: parsed.data.provider,
        url: parsed.data.url,
      });
      if (!track.success) return NextResponse.json({ error: "traccia embed non valida" }, { status: 400 });

      const privileged = createSupabaseServiceRoleClient();
      // Upload ed embed condividono la stessa lista e lo stesso ordinamento.
      // Gli upload calcolano il prossimo sort_order dentro la RPC; per l'embed
      // lo facciamo qui sul backend privilegiato invece di lasciare il default 0.
      const { data: lastTrack, error: orderError } = await privileged
        .from("site_tracks")
        .select("sort_order")
        .eq("site_id", parsed.data.siteId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orderError) return NextResponse.json({ error: "ordinamento tracce non leggibile" }, { status: 500 });

      const { data, error } = await privileged.from("site_tracks").insert({
        site_id: parsed.data.siteId,
        title: track.data.title,
        source: "embed",
        embed_provider: track.data.provider,
        embed_url: track.data.url,
        sort_order: (lastTrack?.sort_order ?? -1) + 1,
      }).select("id").single();
      if (error?.code === "23514") return NextResponse.json({ error: "URL non ammesso per il provider" }, { status: 400 });
      if (error || !data) return NextResponse.json({ error: "traccia non creata" }, { status: 500 });
      return NextResponse.json({ id: data.id }, { status: 201 });
    }

    if (!isTrackMimeAllowed(parsed.data.mimeType)) {
      return NextResponse.json({ error: "formato audio non ammesso" }, { status: 415 });
    }

    if (parsed.data.action === "reserve") {
      // Owner verificato anche dentro la RPC service_role: niente confused deputy.
      const ticket = await reserveTrackUpload({
        siteId: parsed.data.siteId,
        userId: user.id,
        bytes: parsed.data.byteSize,
      });
      return NextResponse.json(ticket, { status: 201 });
    }

    const id = await completeTrackUpload({
      siteId: parsed.data.siteId,
      userId: user.id,
      reservationId: parsed.data.reservationId,
      title: parsed.data.title,
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.byteSize,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return operationFailure(error);
  }
}
