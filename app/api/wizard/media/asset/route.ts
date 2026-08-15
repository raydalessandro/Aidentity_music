import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  completeAssetUpload,
  releaseUpload,
  reserveAssetUpload,
} from "@/lib/wizard/upload-server";
import {
  ASSET_BUCKET,
  ASSET_MAX_BYTES,
  isAssetMimeAllowed,
} from "@/lib/wizard/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const common = {
  siteId: z.guid(),
  kind: z.enum(["logo", "visual", "photo_hi", "merch"]),
  byteSize: z.number().int().positive().max(ASSET_MAX_BYTES),
  mimeType: z.string().trim().min(1),
};
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve"), ...common }),
  z.object({ action: z.literal("finalize"), reservationId: z.guid(), ...common }),
  z.object({ action: z.literal("release"), siteId: z.guid(), reservationId: z.guid() }),
]);

function operationFailure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "";
  if (message === "reserve:23514") return NextResponse.json({ error: "quota del piano superata" }, { status: 409 });
  if (message.endsWith(":42501")) return NextResponse.json({ error: "sito non trovato" }, { status: 404 });
  if (message === "stored-object-mismatch") return NextResponse.json({ error: "file trasferito non coerente" }, { status: 409 });
  return NextResponse.json({ error: "upload non completato" }, { status: 500 });
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
        bucket: ASSET_BUCKET,
      });
      return new NextResponse(null, { status: 204 });
    }

    if (!isAssetMimeAllowed(parsed.data.mimeType)) {
      return NextResponse.json({ error: "formato immagine non ammesso" }, { status: 415 });
    }

    if (parsed.data.action === "reserve") {
      const ticket = await reserveAssetUpload({
        siteId: parsed.data.siteId,
        userId: user.id,
        kind: parsed.data.kind,
        bytes: parsed.data.byteSize,
      });
      return NextResponse.json(ticket, { status: 201 });
    }

    const id = await completeAssetUpload({
      siteId: parsed.data.siteId,
      userId: user.id,
      reservationId: parsed.data.reservationId,
      kind: parsed.data.kind,
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.byteSize,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return operationFailure(error);
  }
}
