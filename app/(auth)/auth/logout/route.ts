import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uscita. Solo POST: una GET sarebbe attivabile da un `<img>` di terzi e
 * scollegherebbe l'utente senza che l'abbia chiesto.
 *
 * Sta sotto `/auth/` perche' `auth` e' uno slug riservato di L0.7 §5, mentre
 * `logout` non lo e': un percorso `/logout` collidera' con il sito di un
 * cliente il cui slug fosse "logout".
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/login", new URL(request.url).origin), {
    status: 303,
  });
  const supabase = createSupabaseRouteHandlerClient(request, response);
  await supabase.auth.signOut();
  return response;
}
