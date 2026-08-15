import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

import { safeRedirectPath } from "../../_lib/safe-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atterraggio del magic link. Supabase puo' consegnare il link in due forme:
 * flusso PKCE (`code`) oppure verifica OTP (`token_hash` + `type`). Sono
 * gestite entrambe, cosi' il progetto non dipende da un'impostazione del
 * template email.
 *
 * La sessione viene scritta sui cookie della risposta di redirect, quindi il
 * client viene creato legandolo a quella risposta.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = safeRedirectPath(url.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createSupabaseRouteHandlerClient(request, response);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = error !== null;
  } else if (tokenHash && (type === "magiclink" || type === "email" || type === "signup")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = error !== null;
  }

  if (failed) {
    // Nessun dettaglio nell'URL: un link scaduto e uno mai emesso danno la
    // stessa risposta.
    return NextResponse.redirect(new URL("/login?errore=link-non-valido", url.origin));
  }

  return response;
}
