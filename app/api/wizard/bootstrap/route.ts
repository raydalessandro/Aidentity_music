import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { draftSlugForUser } from "@/lib/wizard/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const scoped = await createSupabaseServerClient();
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });

  const { data: existing, error: readError } = await scoped
    .from("sites")
    .select("id,slug,publication_status")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "impossibile leggere il draft" }, { status: 500 });
  if (existing) return NextResponse.json({ site: existing }, { status: 200 });

  const privileged = createSupabaseServiceRoleClient();
  const slug = draftSlugForUser(user.id);
  const { data: created, error: insertError } = await privileged
    .from("sites")
    .insert({ owner_id: user.id, slug })
    .select("id,slug,publication_status")
    .single();

  if (!insertError && created) return NextResponse.json({ site: created }, { status: 201 });

  // Due richieste contemporanee usano lo stesso slug. Se l'altra ha vinto,
  // rileggiamo tramite RLS invece di creare un secondo sito.
  const { data: raced } = await scoped
    .from("sites")
    .select("id,slug,publication_status")
    .eq("slug", slug)
    .maybeSingle();
  if (raced) return NextResponse.json({ site: raced }, { status: 200 });

  return NextResponse.json({ error: "impossibile creare il draft" }, { status: 500 });
}
