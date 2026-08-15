import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({ siteId: z.guid(), hours: z.number().int().min(1).max(168).default(24) });
const revokeSchema = z.object({ linkId: z.guid() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });

  const { data: site } = await supabase.from("sites").select("id").eq("id", parsed.data.siteId).maybeSingle();
  if (!site) return NextResponse.json({ error: "sito non trovato" }, { status: 404 });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + parsed.data.hours * 60 * 60 * 1000).toISOString();
  const { data: link, error } = await supabase
    .from("site_preview_links")
    .insert({ site_id: site.id, token_hash: tokenHash, expires_at: expiresAt })
    .select("id,expires_at")
    .single();
  if (error || !link) return NextResponse.json({ error: "impossibile creare il link" }, { status: 500 });

  return NextResponse.json({ id: link.id, expiresAt: link.expires_at, url: `/preview/${token}` }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });

  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });

  const { error } = await supabase
    .from("site_preview_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.linkId)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: "impossibile revocare il link" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
