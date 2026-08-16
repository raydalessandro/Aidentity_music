import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { planCodeSchema } from "@/lib/contract";
import { readSiteUrl } from "@/lib/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { requirePriceId } from "../_lib/catalog";
import { ensureStripeCustomer } from "../_lib/customer";
import { billingIntervalSchema } from "../_lib/lifecycle";
import { createStripeClient } from "../_lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  siteId: z.guid(),
  planCode: planCodeSchema,
  interval: billingIntervalSchema,
});

/**
 * Avvia il checkout in modalità test.
 *
 * Il ritorno va al Control Room e non alla landing: dopo il pagamento l'utente
 * deve vedere lo stato del proprio sito, mentre il webhook resta l'unico autore
 * del lifecycle. Il query param è solo UX, non una conferma di pagamento.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });
  }

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("id", body.data.siteId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (siteError) {
    return NextResponse.json({ error: "sito non leggibile" }, { status: 500 });
  }
  if (!site) {
    return NextResponse.json({ error: "sito non trovato" }, { status: 404 });
  }

  const stripe = createStripeClient();
  const siteUrl = readSiteUrl();

  const customerId = await ensureStripeCustomer({
    stripe,
    scoped: supabase,
    privileged: createSupabaseServiceRoleClient(),
    userId: user.id,
    email: user.email,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: requirePriceId(body.data.planCode, body.data.interval), quantity: 1 }],
    client_reference_id: body.data.siteId,
    // Il webhook legge `site_id` dai metadata della SUBSCRIPTION: e' l'unico
    // oggetto presente in tutti gli eventi del ciclo di vita. Metterlo solo
    // sulla sessione non basta — i metadata della sessione non si propagano
    // alla subscription, ed e' il modo classico in cui questo si rompe.
    subscription_data: { metadata: { site_id: body.data.siteId } },
    metadata: { site_id: body.data.siteId },
    success_url: `${siteUrl}/app/wizard?checkout=ok`,
    cancel_url: `${siteUrl}/app/wizard?checkout=annullato`,
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
