import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeSlugInput } from "@/lib/wizard/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ siteId: z.guid(), slug: z.string().trim().min(1) });

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const scoped = await createSupabaseServerClient();
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });

  const slug = normalizeSlugInput(parsed.data.slug);
  if (!slug) return NextResponse.json({ error: "indirizzo non valido" }, { status: 400 });

  const { data: site, error: readError } = await scoped
    .from("sites")
    .select("id,slug,publication_status,approved_at")
    .eq("id", parsed.data.siteId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "sito non leggibile" }, { status: 500 });
  if (!site) return NextResponse.json({ error: "sito non trovato" }, { status: 404 });

  // L0.7 §5: uno slug già pubblicato richiede un redirect. C non inventa qui
  // quella transazione: consente il rename soltanto ai draft mai approvati.
  if (site.publication_status !== "draft" || site.approved_at !== null) {
    return NextResponse.json({ error: "uno slug già pubblicato richiede un redirect" }, { status: 409 });
  }
  if (site.slug === slug) return NextResponse.json({ slug }, { status: 200 });

  const privileged = createSupabaseServiceRoleClient();
  const { data: updated, error } = await privileged
    .from("sites")
    .update({ slug })
    .eq("id", site.id)
    .eq("owner_id", user.id)
    .select("slug")
    .maybeSingle();

  if (error?.code === "23505" || error?.code === "23514") {
    return NextResponse.json({ error: "indirizzo non disponibile" }, { status: 409 });
  }
  if (error || !updated) return NextResponse.json({ error: "impossibile aggiornare l'indirizzo" }, { status: 500 });
  return NextResponse.json({ slug: updated.slug }, { status: 200 });
}
